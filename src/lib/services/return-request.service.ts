import { and, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  orderItems,
  orders,
  printJobs,
  refundItems,
  refunds,
  returnRequestItems,
  returnRequests,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { maskEmail } from '@/lib/logger';
import type { DbTransaction } from '@/lib/services/admin-log.service';
import {
  allocateRefund,
  ZeroRefundAmountError,
} from '@/lib/services/refund-allocation';
import type { RefundDependencies } from '@/lib/services/refund.service';
import { refundOrder } from '@/lib/services/refund.service';
import {
  canCustomerRequestReturn,
  getReturnRules,
  isReturnException,
} from '@/lib/services/return-policy';
import { assertReturnEvidenceUrls } from '@/lib/validators/return-request';
import type {
  AdminReturnListQuery,
  ApproveReturnRequestInput,
  CreateReturnRequestInput,
  CustomerReturnListQuery,
} from '@/lib/validators/return-request';

interface ReviewContext {
  admin: AdminIdentity;
  ip: string;
}

export interface ReturnReviewDependencies {
  refund?: RefundDependencies;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505',
  );
}

function newRequestNo(): string {
  const time = Date.now().toString(36).toUpperCase();
  const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  return `RR${time}${nonce}`;
}

async function loadRequestItems(
  db: DbTransaction | ReturnType<typeof getDb>,
  requestIds: string[],
) {
  if (!requestIds.length) return new Map<string, ReturnItemDetail[]>();
  const rows = await db
    .select({
      requestId: returnRequestItems.requestId,
      orderItemId: returnRequestItems.orderItemId,
      orderId: orderItems.orderId,
      requestedQuantity: returnRequestItems.quantity,
      purchasedQuantity: orderItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      imageUrl: orderItems.imageUrl,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      printStatus: printJobs.status,
    })
    .from(returnRequestItems)
    .innerJoin(orderItems, eq(orderItems.id, returnRequestItems.orderItemId))
    .leftJoin(printJobs, eq(printJobs.orderItemId, orderItems.id))
    .where(inArray(returnRequestItems.requestId, requestIds))
    .orderBy(orderItems.createdAt);
  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const allOrderItems = orderIds.length
    ? await db
        .select({
          id: orderItems.id,
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          subtotal: orderItems.subtotal,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const refundedRows = allOrderItems.length
    ? await db
        .select({
          orderItemId: refundItems.orderItemId,
          quantity: sql<number>`sum(${refundItems.quantity})::int`,
          amount: sql<string>`sum(${refundItems.amount})::numeric(10,2)`,
        })
        .from(refundItems)
        .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
        .where(
          and(
            inArray(
              refundItems.orderItemId,
              allOrderItems.map((item) => item.id),
            ),
            eq(refunds.status, 'success'),
          ),
        )
        .groupBy(refundItems.orderItemId)
    : [];
  const orderRows = orderIds.length
    ? await db
        .select({
          id: orders.id,
          itemsAmount: orders.itemsAmount,
          discountAmount: orders.discountAmount,
          shippingAmount: orders.shippingAmount,
          paidAmount: orders.paidAmount,
        })
        .from(orders)
        .where(inArray(orders.id, orderIds))
    : [];
  const refundedByItem = new Map(
    refundedRows.map((row) => [row.orderItemId, row]),
  );
  const orderById = new Map(orderRows.map((order) => [order.id, order]));
  const itemsByOrder = new Map<string, typeof allOrderItems>();
  for (const item of allOrderItems) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  const orderIdByRequest = new Map<string, string>();
  const byRequest = new Map<string, ReturnItemDetail[]>();
  for (const row of rows) {
    orderIdByRequest.set(row.requestId, row.orderId);
    const refunded = refundedByItem.get(row.orderItemId);
    const refundedQuantity = refunded?.quantity ?? 0;
    const refundedAmount = refunded?.amount ?? '0.00';
    const refundableQuantity = Math.max(
      row.purchasedQuantity - refundedQuantity,
      0,
    );
    const detail: ReturnItemDetail = {
      orderItemId: row.orderItemId,
      requestedQuantity: row.requestedQuantity,
      purchasedQuantity: row.purchasedQuantity,
      productName: row.productName,
      variantName: row.variantName,
      imageUrl: row.imageUrl,
      unitPrice: row.unitPrice,
      subtotal: row.subtotal,
      printStatus: row.printStatus,
      refundedQuantity,
      refundableQuantity,
      refundedAmount,
      refundableAmount: '0.00',
    };
    const items = byRequest.get(row.requestId) ?? [];
    items.push(detail);
    byRequest.set(row.requestId, items);
  }
  for (const [requestId, details] of byRequest) {
    const orderId = orderIdByRequest.get(requestId);
    const order = orderId ? orderById.get(orderId) : undefined;
    const items = orderId ? itemsByOrder.get(orderId) ?? [] : [];
    const requests = details
      .filter((item) => item.refundableQuantity > 0)
      .map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.refundableQuantity,
      }));
    if (!order || !items.length || !requests.length) continue;
    try {
      const allocation = allocateRefund({
        itemsAmount: order.itemsAmount,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        paidAmount: order.paidAmount,
        items: items.map((item) => ({
          orderItemId: item.id,
          subtotal: item.subtotal,
          quantity: item.quantity,
          refundedQuantity: refundedByItem.get(item.id)?.quantity ?? 0,
        })),
        requests,
      });
      const amountByItem = new Map(
        allocation.lines.map((line) => [line.orderItemId, line.amount]),
      );
      for (const detail of details) {
        detail.refundableAmount = amountByItem.get(detail.orderItemId) ?? '0.00';
      }
    } catch (error: unknown) {
      if (!(error instanceof ZeroRefundAmountError)) throw error;
    }
  }
  return byRequest;
}

interface ReturnItemDetail {
  orderItemId: string;
  requestedQuantity: number;
  purchasedQuantity: number;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: string;
  subtotal: string;
  printStatus: string | null;
  refundedQuantity: number;
  refundableQuantity: number;
  refundedAmount: string;
  refundableAmount: string;
}

export async function createReturnRequest(
  userId: string,
  input: CreateReturnRequestInput,
) {
  assertReturnEvidenceUrls(input.images, userId);
  try {
    return await getDb().transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id, orderNo: orders.orderNo })
        .from(orders)
        .where(and(eq(orders.orderNo, input.orderNo), eq(orders.userId, userId)))
        .limit(1);
      if (!order) throw new BizError('NOT_FOUND', '订单不存在');
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`,
      );
      const [existing] = await tx
        .select({ id: returnRequests.id })
        .from(returnRequests)
        .leftJoin(refunds, eq(refunds.id, returnRequests.refundId))
        .where(
          and(
            eq(returnRequests.orderId, order.id),
            or(
              eq(returnRequests.status, 'pending'),
              and(
                eq(returnRequests.status, 'approved'),
                or(isNull(returnRequests.refundId), eq(refunds.status, 'pending')),
              ),
            ),
          ),
        )
        .limit(1);
      if (existing) {
        throw new BizError('RETURN_REQUEST_EXISTS', '该订单已有处理中申请');
      }

      const itemRows = await tx
        .select({
          id: orderItems.id,
          quantity: orderItems.quantity,
          printStatus: printJobs.status,
        })
        .from(orderItems)
        .leftJoin(printJobs, eq(printJobs.orderItemId, orderItems.id))
        .where(eq(orderItems.orderId, order.id));
      const itemById = new Map(itemRows.map((item) => [item.id, item]));
      const refundedRows = await tx
        .select({
          orderItemId: refundItems.orderItemId,
          quantity: sql<number>`sum(${refundItems.quantity})::int`,
        })
        .from(refundItems)
        .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
        .where(and(eq(refunds.orderId, order.id), eq(refunds.status, 'success')))
        .groupBy(refundItems.orderItemId);
      const refundedByItem = new Map(
        refundedRows.map((item) => [item.orderItemId, item.quantity]),
      );
      const rules = await getReturnRules(tx);
      const exception = isReturnException(input.reasonCode, rules);
      for (const requested of input.items) {
        const item = itemById.get(requested.orderItemId);
        if (!item) throw new BizError('NOT_FOUND', '申请商品不属于该订单');
        const refundable = item.quantity - (refundedByItem.get(item.id) ?? 0);
        if (requested.quantity > refundable) {
          throw new BizError(
            'RETURN_AMOUNT_EXCEEDED',
            `申请数量超过商品可退数量（剩余 ${refundable} 件）`,
          );
        }
        if (!item.printStatus && exception) {
          throw new BizError(
            'RETURN_FIT_EXCEPTION',
            '尺寸或装配例外只适用于已进入打印流程的商品',
          );
        }
        if (
          !canCustomerRequestReturn(
            item.printStatus,
            input.reasonCode,
            rules,
          )
        ) {
          throw new BizError(
            'RETURN_NOT_ALLOWED',
            `商品当前打印状态 ${item.printStatus ?? '未排产'} 不允许申请`,
          );
        }
      }

      const [created] = await tx
        .insert(returnRequests)
        .values({
          requestNo: newRequestNo(),
          orderId: order.id,
          userId,
          reasonCode: input.reasonCode,
          reasonText: input.reasonText,
          images: input.images,
        })
        .returning({
          id: returnRequests.id,
          requestNo: returnRequests.requestNo,
          status: returnRequests.status,
          createdAt: returnRequests.createdAt,
        });
      if (!created) throw new BizError('INTERNAL_ERROR', '退款申请创建失败');
      await tx.insert(returnRequestItems).values(
        input.items.map((item) => ({
          requestId: created.id,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      );
      return created;
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new BizError('RETURN_REQUEST_EXISTS', '该订单已有待审核申请');
    }
    throw error;
  }
}

export async function listCustomerReturnRequests(
  userId: string,
  query: CustomerReturnListQuery,
) {
  const db = getDb();
  const where = eq(returnRequests.userId, userId);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: returnRequests.id,
        requestNo: returnRequests.requestNo,
        orderNo: orders.orderNo,
        reasonCode: returnRequests.reasonCode,
        reasonText: returnRequests.reasonText,
        images: returnRequests.images,
        status: returnRequests.status,
        reviewRemark: returnRequests.reviewRemark,
        reviewedAt: returnRequests.reviewedAt,
        refundId: returnRequests.refundId,
        createdAt: returnRequests.createdAt,
        updatedAt: returnRequests.updatedAt,
      })
      .from(returnRequests)
      .innerJoin(orders, eq(orders.id, returnRequests.orderId))
      .where(where)
      .orderBy(desc(returnRequests.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(returnRequests).where(where),
  ]);
  const items = await loadRequestItems(
    db,
    rows.map((row) => row.id),
  );
  return {
    list: rows.map((row) => ({ ...row, items: items.get(row.id) ?? [] })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getCustomerReturnRequest(
  userId: string,
  requestNo: string,
) {
  const db = getDb();
  const [record] = await db
    .select({
      id: returnRequests.id,
      requestNo: returnRequests.requestNo,
      orderNo: orders.orderNo,
      reasonCode: returnRequests.reasonCode,
      reasonText: returnRequests.reasonText,
      images: returnRequests.images,
      status: returnRequests.status,
      reviewRemark: returnRequests.reviewRemark,
      reviewedAt: returnRequests.reviewedAt,
      refundId: returnRequests.refundId,
      createdAt: returnRequests.createdAt,
      updatedAt: returnRequests.updatedAt,
    })
    .from(returnRequests)
    .innerJoin(orders, eq(orders.id, returnRequests.orderId))
    .where(
      and(
        eq(returnRequests.requestNo, requestNo),
        eq(returnRequests.userId, userId),
      ),
    )
    .limit(1);
  if (!record) throw new BizError('NOT_FOUND', '退款申请不存在');
  const items = await loadRequestItems(db, [record.id]);
  return { ...record, items: items.get(record.id) ?? [] };
}

export async function cancelCustomerReturnRequest(
  userId: string,
  requestNo: string,
) {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(returnRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(returnRequests.requestNo, requestNo),
          eq(returnRequests.userId, userId),
          eq(returnRequests.status, 'pending'),
        ),
      )
      .returning({
        id: returnRequests.id,
        requestNo: returnRequests.requestNo,
        status: returnRequests.status,
      });
    if (updated) return updated;
    const [existing] = await tx
      .select({ status: returnRequests.status })
      .from(returnRequests)
      .where(
        and(
          eq(returnRequests.requestNo, requestNo),
          eq(returnRequests.userId, userId),
        ),
      )
      .limit(1);
    if (!existing) throw new BizError('NOT_FOUND', '退款申请不存在');
    throw new BizError('RETURN_STATUS_INVALID', '只有待审核申请可以撤销');
  });
}

export async function listAdminReturnRequests(query: AdminReturnListQuery) {
  const db = getDb();
  const where = query.status
    ? eq(returnRequests.status, query.status)
    : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: returnRequests.id,
        requestNo: returnRequests.requestNo,
        orderId: returnRequests.orderId,
        orderNo: orders.orderNo,
        userId: returnRequests.userId,
        userEmail: userProfiles.email,
        reasonCode: returnRequests.reasonCode,
        reasonText: returnRequests.reasonText,
        images: returnRequests.images,
        status: returnRequests.status,
        reviewerId: returnRequests.reviewerId,
        reviewRemark: returnRequests.reviewRemark,
        reviewedAt: returnRequests.reviewedAt,
        refundId: returnRequests.refundId,
        createdAt: returnRequests.createdAt,
        updatedAt: returnRequests.updatedAt,
      })
      .from(returnRequests)
      .innerJoin(orders, eq(orders.id, returnRequests.orderId))
      .innerJoin(userProfiles, eq(userProfiles.id, returnRequests.userId))
      .where(where)
      .orderBy(desc(returnRequests.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(returnRequests).where(where),
  ]);
  const items = await loadRequestItems(
    db,
    rows.map((row) => row.id),
  );
  const rules = await getReturnRules(db);
  return {
    list: rows.map((row) => ({
      ...row,
      userEmail: maskEmail(row.userEmail),
      isException: isReturnException(row.reasonCode, rules),
      items: items.get(row.id) ?? [],
    })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function logReview(
  tx: DbTransaction,
  context: ReviewContext,
  action: string,
  requestId: string,
  payload?: Record<string, unknown>,
) {
  await tx.insert(adminOperationLogs).values({
    adminId: context.admin.sub,
    adminName: context.admin.name,
    action,
    targetType: 'return_request',
    targetId: requestId,
    payload,
    ip: context.ip,
  });
}

export async function approveReturnRequest(
  requestId: string,
  input: ApproveReturnRequestInput,
  context: ReviewContext,
  dependencies: ReturnReviewDependencies = {},
) {
  const claimed = await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`,
    );
    const [request] = await tx
      .select({
        id: returnRequests.id,
        orderId: returnRequests.orderId,
        reasonCode: returnRequests.reasonCode,
        reasonText: returnRequests.reasonText,
        status: returnRequests.status,
      })
      .from(returnRequests)
      .where(eq(returnRequests.id, requestId))
      .limit(1)
      .for('update');
    if (!request) throw new BizError('NOT_FOUND', '退款申请不存在');
    if (request.status !== 'pending') {
      throw new BizError('RETURN_STATUS_INVALID', '申请状态不允许审核');
    }
    const items = await tx
      .select({
        orderItemId: returnRequestItems.orderItemId,
        quantity: returnRequestItems.quantity,
        printStatus: printJobs.status,
      })
      .from(returnRequestItems)
      .innerJoin(orderItems, eq(orderItems.id, returnRequestItems.orderItemId))
      .leftJoin(printJobs, eq(printJobs.orderItemId, orderItems.id))
      .where(eq(returnRequestItems.requestId, requestId));
    const reviewByItem = new Map(
      input.items.map((item) => [item.orderItemId, item]),
    );
    if (
      reviewByItem.size !== items.length ||
      items.some((item) => !reviewByItem.has(item.orderItemId))
    ) {
      throw new BizError('PARAM_INVALID', '审核商品必须与申请商品完全一致');
    }
    const rules = await getReturnRules(tx);
    const exception = isReturnException(request.reasonCode, rules);
    for (const item of items) {
      if (exception && !item.printStatus) {
        throw new BizError('RETURN_FIT_EXCEPTION', '例外申请商品未进入打印流程');
      }
      if (
        !exception &&
        !canCustomerRequestReturn(item.printStatus, request.reasonCode, rules)
      ) {
        throw new BizError(
          'RETURN_NOT_ALLOWED',
          '普通原因不能越过当前打印状态受理',
        );
      }
    }
    const now = new Date();
    const [updated] = await tx
      .update(returnRequests)
      .set({
        status: 'approved',
        reviewerId: context.admin.sub,
        reviewRemark: '申请已通过审核，退款处理中',
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(returnRequests.id, requestId),
          eq(returnRequests.status, 'pending'),
        ),
      )
      .returning({ id: returnRequests.id });
    if (!updated) {
      throw new BizError('RETURN_STATUS_INVALID', '申请已被其他管理员处理');
    }
    await logReview(tx, context, 'return.review.approve', requestId, {
      reasonCode: request.reasonCode,
      items: input.items,
      reviewRemark: input.reviewRemark ?? null,
    });
    return { ...request, items };
  });

  try {
    return await refundOrder(
      claimed.orderId,
      {
        idempotencyKey: `return:${requestId}`,
        reason: `售后申请 ${requestId}`,
        items: claimed.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          restock: input.items.find(
            (review) => review.orderItemId === item.orderItemId,
          )!.restock,
        })),
      },
      { ...context, returnRequestId: requestId },
      dependencies.refund,
    );
  } catch (error: unknown) {
    const [refund] = await getDb()
      .select({ id: refunds.id, status: refunds.status })
      .from(refunds)
      .where(
        and(
          eq(refunds.orderId, claimed.orderId),
          eq(refunds.idempotencyKey, `return:${requestId}`),
        ),
      )
      .limit(1);
    await getDb().transaction(async (tx) => {
      if (refund) {
        await tx
          .update(returnRequests)
          .set({
            refundId: refund.id,
            ...(refund.status === 'pending'
              ? { reviewRemark: '退款结果待确认，正在人工复核' }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(returnRequests.id, requestId));
      }
      if (!refund || refund.status === 'failed') {
        const [otherPending] = !refund
          ? await tx
              .select({ id: returnRequests.id })
              .from(returnRequests)
              .where(
                and(
                  eq(returnRequests.orderId, claimed.orderId),
                  eq(returnRequests.status, 'pending'),
                  ne(returnRequests.id, requestId),
                ),
              )
              .limit(1)
          : [];
        const status =
          refund?.status === 'failed' || otherPending ? 'rejected' : 'pending';
        await tx
          .update(returnRequests)
          .set({
            status,
            ...(status === 'pending'
              ? { reviewerId: null, reviewedAt: null }
              : {}),
            reviewRemark:
              status === 'pending'
                ? '退款尚未发起，请等待重新审核'
                : '退款未获支付渠道受理，本次申请已结束',
            updatedAt: new Date(),
          })
          .where(eq(returnRequests.id, requestId));
      }
      await logReview(tx, context, 'return.review.refund_error', requestId, {
        refundId: refund?.id,
        refundStatus: refund?.status,
        message: error instanceof Error ? error.message : '未知错误',
      });
    });
    throw error;
  }
}

export async function rejectReturnRequest(
  requestId: string,
  reviewRemark: string,
  context: ReviewContext,
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`,
    );
    const now = new Date();
    const [updated] = await tx
      .update(returnRequests)
      .set({
        status: 'rejected',
        reviewerId: context.admin.sub,
        reviewRemark: '申请未通过审核，请联系客户服务了解详情',
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(returnRequests.id, requestId),
          eq(returnRequests.status, 'pending'),
        ),
      )
      .returning({ id: returnRequests.id, status: returnRequests.status });
    if (!updated) {
      const [existing] = await tx
        .select({ id: returnRequests.id })
        .from(returnRequests)
        .where(eq(returnRequests.id, requestId))
        .limit(1);
      if (!existing) throw new BizError('NOT_FOUND', '退款申请不存在');
      throw new BizError('RETURN_STATUS_INVALID', '申请状态不允许驳回');
    }
    await logReview(tx, context, 'return.review.reject', requestId, {
      reviewRemark,
    });
    return updated;
  });
}
