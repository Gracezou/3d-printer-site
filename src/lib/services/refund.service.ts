import Decimal from 'decimal.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  orderItems,
  orders,
  payments,
  printJobs,
  refundItems,
  refunds,
  returnRequests,
} from '@/lib/db/schema';
import { BizError, ERROR_DEFINITIONS } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import type { DbTransaction } from '@/lib/services/admin-log.service';
import {
  allocateRefund,
  ZeroRefundAmountError,
} from '@/lib/services/refund-allocation';
import { getPaymentProvider } from '@/lib/services/payment/provider.factory';
import type {
  PaymentProvider,
  PaymentProviderCode,
} from '@/lib/services/payment/provider.interface';
import {
  lockRefundStockMaterials,
  returnRefundItemStock,
} from '@/lib/services/refund-stock.service';
import { isOrderProductionReady } from '@/lib/services/production.service';
import { releaseDiscount } from '@/lib/services/promotion.service';
import type { AdminOrderRefundInput } from '@/lib/validators/admin-order';

export interface RefundContext {
  admin: AdminIdentity;
  ip: string;
  returnRequestId?: string;
}

interface PendingRefund {
  orderId: string;
  refundId: string;
  paymentId: string;
  provider: PaymentProviderCode;
  outTradeNo: string;
  outRefundNo: string;
  amount: string;
  reason: string;
  isFullRefund: boolean;
  previousStatus: string;
  providerConfirmedAt: Date | null;
  attemptToken: string | null;
  created: boolean;
}

interface RefundLineResult {
  id: string;
  orderItemId: string;
  quantity: number;
  itemsAmount: string;
  discountShare: string;
  shippingShare: string;
  amount: string;
  restock: boolean;
}

export interface RefundResult {
  id: string;
  outRefundNo: string;
  amount: string;
  isFullRefund: boolean;
  restock: boolean;
  status: 'success';
  items: RefundLineResult[];
}

export interface RefundDependencies {
  getProvider?: (code: PaymentProviderCode) => PaymentProvider;
}

function processingLeaseUntil() {
  return sql`now() + interval '60 seconds'`;
}

const refundableOrderStatuses = [
  'paid',
  'in_production',
  'pending_shipment',
  'shipped',
  'completed',
] as const;

function paymentProviderCode(value: string): PaymentProviderCode {
  if (value === 'alipay_page' || value === 'mock') return value;
  throw new BizError('PAYMENT_PROVIDER_ERROR', '该支付渠道暂不支持退款');
}

function sameRequest(
  persisted: Array<{
    orderItemId: string;
    quantity: number;
    restock: boolean;
  }>,
  requested: AdminOrderRefundInput['items'],
): boolean {
  if (persisted.length !== requested.length) return false;
  const requestedById = new Map(
    requested.map((item) => [item.orderItemId, item]),
  );
  return persisted.every((item) => {
    const request = requestedById.get(item.orderItemId);
    return (
      request?.quantity === item.quantity && request.restock === item.restock
    );
  });
}

async function loadRefundLines(
  tx: DbTransaction | ReturnType<typeof getDb>,
  refundId: string,
): Promise<RefundLineResult[]> {
  return tx
    .select({
      id: refundItems.id,
      orderItemId: refundItems.orderItemId,
      quantity: refundItems.quantity,
      itemsAmount: refundItems.itemsAmount,
      discountShare: refundItems.discountShare,
      shippingShare: refundItems.shippingShare,
      amount: refundItems.amount,
      restock: refundItems.restock,
    })
    .from(refundItems)
    .where(eq(refundItems.refundId, refundId))
    .orderBy(asc(refundItems.orderItemId));
}

async function existingResult(
  tx: DbTransaction | ReturnType<typeof getDb>,
  refund: {
    id: string;
    outRefundNo: string;
    amount: string;
    isFullRefund: boolean;
    restock: boolean;
  },
): Promise<RefundResult> {
  return {
    id: refund.id,
    outRefundNo: refund.outRefundNo,
    amount: refund.amount,
    isFullRefund: refund.isFullRefund,
    restock: refund.restock,
    status: 'success',
    items: await loadRefundLines(tx, refund.id),
  };
}

async function prepareRefund(
  orderId: string,
  input: AdminOrderRefundInput,
  context: RefundContext,
): Promise<PendingRefund | RefundResult> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);

    const [sameKey] = await tx
      .select({
        id: refunds.id,
        orderId: refunds.orderId,
        paymentId: refunds.paymentId,
        outRefundNo: refunds.outRefundNo,
        amount: refunds.amount,
        isFullRefund: refunds.isFullRefund,
        restock: refunds.restock,
        reason: refunds.reason,
        status: refunds.status,
        previousStatus: refunds.previousOrderStatus,
        providerConfirmedAt: refunds.providerConfirmedAt,
        paymentProvider: payments.provider,
        outTradeNo: payments.outTradeNo,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(
        and(
          eq(refunds.orderId, orderId),
          eq(refunds.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (sameKey) {
      const lines = await loadRefundLines(tx, sameKey.id);
      if (!sameRequest(lines, input.items) || sameKey.reason !== input.reason) {
        throw new BizError('PARAM_INVALID', '幂等键对应的退款内容不一致');
      }
      if (sameKey.status === 'success') return existingResult(tx, sameKey);
      if (sameKey.status === 'failed') {
        throw new BizError(
          'REFUND_REJECTED',
          '该退款已被渠道明确拒绝，可修正原因后重新发起',
        );
      }
      if (!sameKey.previousStatus) {
        throw new BizError('INTERNAL_ERROR', '退款记录缺少订单恢复状态');
      }
      return {
        orderId,
        refundId: sameKey.id,
        paymentId: sameKey.paymentId,
        provider: paymentProviderCode(sameKey.paymentProvider),
        outTradeNo: sameKey.outTradeNo,
        outRefundNo: sameKey.outRefundNo,
        amount: sameKey.amount,
        reason: sameKey.reason ?? '',
        isFullRefund: sameKey.isFullRefund,
        previousStatus: sameKey.previousStatus,
        providerConfirmedAt: sameKey.providerConfirmedAt,
        attemptToken: null,
        created: false,
      };
    }

    const [order] = await tx
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        itemsAmount: orders.itemsAmount,
        discountAmount: orders.discountAmount,
        shippingAmount: orders.shippingAmount,
        paidAmount: orders.paidAmount,
        refundedAmount: orders.refundedAmount,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    if (!order) throw new BizError('NOT_FOUND', '订单不存在');
    if (
      !refundableOrderStatuses.includes(
        order.status as (typeof refundableOrderStatuses)[number],
      )
    ) {
      throw new BizError(
        order.status === 'refunded'
          ? 'RETURN_AMOUNT_EXCEEDED'
          : 'ORDER_STATUS_INVALID',
        order.status === 'refunded'
          ? '订单商品已全部退款'
          : '当前订单状态不可退款',
      );
    }

    const [existingPending] = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.orderId, orderId), eq(refunds.status, 'pending')))
      .limit(1);
    if (existingPending) {
      throw new BizError('RETURN_STATUS_INVALID', '该订单有退款正在处理');
    }

    const [legacyPartial] = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(
        and(
          eq(refunds.orderId, orderId),
          eq(refunds.status, 'success'),
          eq(refunds.isFullRefund, false),
          sql`NOT EXISTS (SELECT 1 FROM ${refundItems} ri WHERE ri.refund_id = ${refunds.id})`,
        ),
      )
      .limit(1);
    if (legacyPartial) {
      throw new BizError(
        'RETURN_STATUS_INVALID',
        '历史部分退款无商品明细，请转人工对账',
      );
    }

    const itemRows = await tx
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        subtotal: orderItems.subtotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.id))
      .for('update');
    if (!itemRows.length) {
      throw new BizError('RETURN_STATUS_INVALID', '订单没有可退款的商品明细');
    }

    const refundedRows = await tx
      .select({
        orderItemId: refundItems.orderItemId,
        quantity: sql<number>`sum(${refundItems.quantity})::int`,
      })
      .from(refundItems)
      .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
      .where(and(eq(refunds.orderId, orderId), eq(refunds.status, 'success')))
      .groupBy(refundItems.orderItemId);
    const refundedByItem = new Map(
      refundedRows.map((item) => [item.orderItemId, item.quantity]),
    );
    const itemById = new Map(itemRows.map((item) => [item.id, item]));
    for (const request of input.items) {
      const item = itemById.get(request.orderItemId);
      if (!item) {
        throw new BizError('PARAM_INVALID', '退款商品不属于该订单');
      }
      const remaining = item.quantity - (refundedByItem.get(item.id) ?? 0);
      if (request.quantity > remaining) {
        throw new BizError(
          'RETURN_AMOUNT_EXCEEDED',
          `退款数量超过商品可退数量（剩余 ${remaining} 件）`,
        );
      }
    }

    let allocation;
    try {
      allocation = allocateRefund({
        itemsAmount: order.itemsAmount,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        paidAmount: order.paidAmount,
        items: itemRows.map((item) => ({
          orderItemId: item.id,
          subtotal: item.subtotal,
          quantity: item.quantity,
          refundedQuantity: refundedByItem.get(item.id) ?? 0,
        })),
        requests: input.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      });
    } catch (error: unknown) {
      if (error instanceof ZeroRefundAmountError) {
        throw new BizError(
          'ZERO_AMOUNT_REFUND',
          '实退金额为 0，不能发起渠道退款',
        );
      }
      logger.error({ err: error, orderId }, '退款金额分摊失败');
      throw new BizError('INTERNAL_ERROR', '订单退款金额无法分摊');
    }
    if (
      new Decimal(order.refundedAmount)
        .plus(allocation.amount)
        .gt(order.paidAmount)
    ) {
      throw new BizError('RETURN_AMOUNT_EXCEEDED', '退款金额超过订单可退余额');
    }

    const [payment] = await tx
      .select({
        id: payments.id,
        outTradeNo: payments.outTradeNo,
        provider: payments.provider,
      })
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          inArray(payments.status, ['success', 'refunded']),
        ),
      )
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(1);
    if (!payment) {
      throw new BizError(
        'ORDER_STATUS_INVALID',
        '订单没有可退款的成功支付记录',
      );
    }

    const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    const outRefundNo = `R${order.orderNo}-${nonce}`;
    const restockById = new Map(
      input.items.map((item) => [item.orderItemId, item.restock]),
    );
    const restock = input.items.some((item) => item.restock);
    const attemptToken = crypto.randomUUID();
    const printJobRows = await tx
      .select({
        orderItemId: printJobs.orderItemId,
        status: printJobs.status,
      })
      .from(printJobs)
      .where(
        inArray(
          printJobs.orderItemId,
          input.items.map((item) => item.orderItemId),
        ),
      );
    const printStatusByItem = new Map(
      printJobRows.map((job) => [job.orderItemId, job.status]),
    );
    const [record] = await tx
      .insert(refunds)
      .values({
        orderId,
        paymentId: payment.id,
        outRefundNo,
        idempotencyKey: input.idempotencyKey,
        amount: allocation.amount,
        isFullRefund: allocation.isFullRefund,
        restock,
        reason: input.reason,
        previousOrderStatus: order.status,
        processingToken: attemptToken,
        processingUntil: processingLeaseUntil(),
        operatorId: context.admin.sub,
      })
      .returning({ id: refunds.id });
    if (!record) throw new BizError('INTERNAL_ERROR', '创建退款记录失败');
    if (context.returnRequestId) {
      const [linkedRequest] = await tx
        .update(returnRequests)
        .set({ refundId: record.id, updatedAt: new Date() })
        .where(
          and(
            eq(returnRequests.id, context.returnRequestId),
            eq(returnRequests.orderId, orderId),
            eq(returnRequests.status, 'approved'),
          ),
        )
        .returning({ id: returnRequests.id });
      if (!linkedRequest) {
        throw new BizError('RETURN_STATUS_INVALID', '售后申请状态不允许发起退款');
      }
    }

    await tx.insert(refundItems).values(
      allocation.lines.map((line) => ({
        refundId: record.id,
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        itemsAmount: line.itemsAmount,
        discountShare: line.discountShare,
        shippingShare: line.shippingShare,
        amount: line.amount,
        restock: restockById.get(line.orderItemId) ?? false,
      })),
    );
    await tx
      .update(orders)
      .set({ status: 'refunding', updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await tx.insert(adminOperationLogs).values({
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.request',
      targetType: 'order',
      targetId: orderId,
      payload: {
        refundId: record.id,
        idempotencyKey: input.idempotencyKey,
        amount: allocation.amount,
        items: input.items.map((item) => ({
          ...item,
          printJobStatus: printStatusByItem.get(item.orderItemId) ?? null,
        })),
      },
      ip: context.ip,
    });
    return {
      orderId,
      refundId: record.id,
      paymentId: payment.id,
      provider: paymentProviderCode(payment.provider),
      outTradeNo: payment.outTradeNo,
      outRefundNo,
      amount: allocation.amount,
      reason: input.reason,
      isFullRefund: allocation.isFullRefund,
      previousStatus: order.status,
      providerConfirmedAt: null,
      attemptToken,
      created: true,
    };
  });
}

async function acquireProcessingLease(
  pending: PendingRefund,
): Promise<PendingRefund> {
  if (pending.attemptToken) return pending;
  const attemptToken = crypto.randomUUID();
  const [leased] = await getDb()
    .update(refunds)
    .set({
      processingToken: attemptToken,
      processingUntil: processingLeaseUntil(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(refunds.id, pending.refundId),
        eq(refunds.status, 'pending'),
        sql`(${refunds.processingUntil} IS NULL OR ${refunds.processingUntil} < now())`,
      ),
    )
    .returning({ id: refunds.id });
  if (!leased) {
    throw new BizError('REFUND_IN_PROGRESS', '该退款正在处理，请稍后续记');
  }
  return { ...pending, attemptToken };
}

async function renewProcessingLease(pending: PendingRefund): Promise<void> {
  const [renewed] = await getDb()
    .update(refunds)
    .set({
      processingUntil: processingLeaseUntil(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(refunds.id, pending.refundId),
        eq(refunds.status, 'pending'),
        eq(refunds.processingToken, pending.attemptToken!),
      ),
    )
    .returning({ id: refunds.id });
  if (!renewed) {
    logger.error(
      { refundId: pending.refundId },
      'Failed to renew refund processing lease because ownership was lost',
    );
    throw new BizError('REFUND_IN_PROGRESS', '退款处理租约已失效');
  }
}

async function markProviderConfirmed(
  pending: PendingRefund,
  providerRefundId?: string,
): Promise<void> {
  const [updated] = await getDb()
    .update(refunds)
    .set({
      providerRefundId,
      providerConfirmedAt: new Date(),
      needsManualReview: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(refunds.id, pending.refundId),
        eq(refunds.status, 'pending'),
        eq(refunds.processingToken, pending.attemptToken!),
      ),
    )
    .returning({ id: refunds.id });
  if (!updated) {
    logger.error(
      { refundId: pending.refundId },
      'Failed to persist provider-confirmed refund because the processing lease was lost',
    );
    throw new BizError('RETURN_STATUS_INVALID', '退款处理租约已失效');
  }
}

async function markManualReview(pending: PendingRefund): Promise<void> {
  const [updated] = await getDb()
    .update(refunds)
    .set({
      needsManualReview: true,
      processingToken: null,
      processingUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(refunds.id, pending.refundId),
        eq(refunds.status, 'pending'),
        eq(refunds.processingToken, pending.attemptToken!),
      ),
    )
    .returning({ id: refunds.id });
  if (!updated) {
    logger.error(
      { refundId: pending.refundId },
      'Failed to mark refund for manual review because the processing lease was lost',
    );
  }
}

function unknownRefundError(): BizError {
  return new BizError(
    'PAYMENT_PROVIDER_ERROR',
    '支付渠道退款结果未确认，请在退款记录中稍后续记',
  );
}

async function queryProviderRefund(
  pending: PendingRefund,
  provider: PaymentProvider,
) {
  await renewProcessingLease(pending);
  return provider.queryRefund({
    outTradeNo: pending.outTradeNo,
    outRefundNo: pending.outRefundNo,
    amount: pending.amount,
  });
}

async function attemptProviderRefund(
  pending: PendingRefund,
  provider: PaymentProvider,
) {
  await renewProcessingLease(pending);
  try {
    return await provider.refund({
      outTradeNo: pending.outTradeNo,
      outRefundNo: pending.outRefundNo,
      amount: pending.amount,
      reason: pending.reason,
    });
  } catch (error: unknown) {
    logger.warn(
      { err: error, refundId: pending.refundId },
      'Refund request raised an exception; treating the result as unknown',
    );
    return {
      status: 'unknown' as const,
      message: error instanceof Error ? error.message : '退款请求异常',
    };
  }
}

async function rejectRefund(
  pending: PendingRefund,
  message?: string,
  canMarkFailed = false,
): Promise<never> {
  if (canMarkFailed) {
    await markRefundFailed(pending, message);
    throw new BizError('REFUND_REJECTED', message || '支付渠道明确拒绝退款');
  }
  throw new BizError(
    'REFUND_MANUAL_REVIEW_REQUIRED',
    '支付渠道在重试或续记时返回拒绝，退款可能已生效，请人工复核',
  );
}

async function callOrRecoverProvider(
  pending: PendingRefund,
  provider: PaymentProvider,
): Promise<void> {
  if (pending.providerConfirmedAt) return;

  try {
    if (!pending.created) {
      const queried = await queryProviderRefund(pending, provider);
      if (queried.status === 'success') {
        await markProviderConfirmed(pending, queried.providerRefundId);
        return;
      }
      if (queried.status === 'pending') throw unknownRefundError();
    }

    const firstAttempt = await attemptProviderRefund(pending, provider);
    if (firstAttempt.status === 'success') {
      await markProviderConfirmed(pending, firstAttempt.providerRefundId);
      return;
    }
    if (firstAttempt.status === 'rejected') {
      return await rejectRefund(pending, firstAttempt.message, pending.created);
    }

    const queried = await queryProviderRefund(pending, provider);
    if (queried.status === 'success') {
      await markProviderConfirmed(pending, queried.providerRefundId);
      return;
    }
    if (queried.status === 'pending') throw unknownRefundError();

    const retry = await attemptProviderRefund(pending, provider);
    if (retry.status === 'success') {
      await markProviderConfirmed(pending, retry.providerRefundId);
      return;
    }
    if (retry.status === 'rejected') {
      return await rejectRefund(pending, retry.message);
    }

    const finalQuery = await queryProviderRefund(pending, provider);
    if (finalQuery.status === 'success') {
      await markProviderConfirmed(pending, finalQuery.providerRefundId);
      return;
    }
    throw unknownRefundError();
  } catch (error: unknown) {
    if (
      error instanceof BizError &&
      error.code === ERROR_DEFINITIONS.REFUND_REJECTED.code
    ) {
      throw error;
    }
    await markManualReview(pending);
    throw error;
  }
}

async function finalizeRefund(
  orderId: string,
  pending: PendingRefund,
  context: RefundContext,
): Promise<RefundResult> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);
    const [record] = await tx
      .select({
        id: refunds.id,
        orderId: refunds.orderId,
        paymentId: refunds.paymentId,
        outRefundNo: refunds.outRefundNo,
        amount: refunds.amount,
        isFullRefund: refunds.isFullRefund,
        restock: refunds.restock,
        status: refunds.status,
        providerConfirmedAt: refunds.providerConfirmedAt,
        previousStatus: refunds.previousOrderStatus,
        processingToken: refunds.processingToken,
      })
      .from(refunds)
      .where(eq(refunds.id, pending.refundId))
      .limit(1)
      .for('update');
    if (!record || record.orderId !== orderId) {
      throw new BizError('NOT_FOUND', '退款记录不存在');
    }
    if (record.status === 'success') return existingResult(tx, record);
    if (record.status !== 'pending') {
      throw new BizError('RETURN_STATUS_INVALID', '退款记录已被处理');
    }
    if (!record.providerConfirmedAt) {
      throw new BizError('RETURN_STATUS_INVALID', '支付渠道退款结果尚未确认');
    }
    if (!record.previousStatus) {
      throw new BizError('INTERNAL_ERROR', '退款记录缺少订单恢复状态');
    }
    if (record.processingToken !== pending.attemptToken) {
      throw new BizError('REFUND_IN_PROGRESS', '该退款正在由其他请求处理');
    }

    const [order] = await tx
      .select({
        status: orders.status,
        paidAmount: orders.paidAmount,
        refundedAmount: orders.refundedAmount,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for('update');
    if (!order || order.status !== 'refunding') {
      throw new BizError(
        'RETURN_STATUS_INVALID',
        '订单状态已变化，无法续记退款',
      );
    }
    if (
      new Decimal(order.refundedAmount).plus(record.amount).gt(order.paidAmount)
    ) {
      throw new BizError('RETURN_AMOUNT_EXCEEDED', '退款金额超过订单可退余额');
    }

    const lines = await loadRefundLines(tx, pending.refundId);
    const printJobRows = lines.length
      ? await tx
          .select({
            id: printJobs.id,
            orderItemId: printJobs.orderItemId,
            status: printJobs.status,
            quantity: printJobs.quantity,
            purchasedQuantity: orderItems.quantity,
          })
          .from(printJobs)
          .innerJoin(orderItems, eq(orderItems.id, printJobs.orderItemId))
          .where(
            inArray(
              printJobs.orderItemId,
              lines.map((line) => line.orderItemId),
            ),
          )
          .for('update')
      : [];
    const printJobByItem = new Map(
      printJobRows.map((job) => [job.orderItemId, job]),
    );

    const [updatedRefund] = await tx
      .update(refunds)
      .set({
        status: 'success',
        needsManualReview: false,
        processingToken: null,
        processingUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refunds.id, pending.refundId),
          eq(refunds.status, 'pending'),
          eq(refunds.processingToken, pending.attemptToken!),
        ),
      )
      .returning({ id: refunds.id });
    if (!updatedRefund) {
      throw new BizError('RETURN_STATUS_INVALID', '退款记录已被处理');
    }
    const refundedQuantityRows = lines.length
      ? await tx
          .select({
            orderItemId: refundItems.orderItemId,
            quantity: sql<number>`sum(${refundItems.quantity})::int`,
          })
          .from(refundItems)
          .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
          .where(
            and(
              inArray(
                refundItems.orderItemId,
                lines.map((line) => line.orderItemId),
              ),
              eq(refunds.status, 'success'),
            ),
          )
          .groupBy(refundItems.orderItemId)
      : [];
    const refundedQuantityByItem = new Map(
      refundedQuantityRows.map((item) => [item.orderItemId, item.quantity]),
    );

    if (record.isFullRefund) {
      await tx
        .update(payments)
        .set({ status: 'refunded', updatedAt: new Date() })
        .where(eq(payments.id, record.paymentId));
    }
    await lockRefundStockMaterials(
      tx,
      lines.map((line) => line.id),
    );
    for (const line of lines) {
      await returnRefundItemStock(tx, line.id, context.admin.sub);
    }
    for (const line of lines) {
      const job = printJobByItem.get(line.orderItemId);
      if (!job || job.status !== 'queued') continue;
      const remainingQuantity = Math.min(
        job.quantity,
        Math.max(
          job.purchasedQuantity -
            (refundedQuantityByItem.get(line.orderItemId) ?? 0),
          0,
        ),
      );
      if (remainingQuantity <= 0) {
        await tx
          .delete(printJobs)
          .where(and(eq(printJobs.id, job.id), eq(printJobs.status, 'queued')));
      } else {
        await tx
          .update(printJobs)
          .set({ quantity: remainingQuantity, updatedAt: new Date() })
          .where(and(eq(printJobs.id, job.id), eq(printJobs.status, 'queued')));
      }
    }
    if (record.isFullRefund) await releaseDiscount(tx, orderId);

    let nextStatus = record.isFullRefund ? 'refunded' : record.previousStatus;
    if (
      !record.isFullRefund &&
      record.previousStatus === 'in_production' &&
      (await isOrderProductionReady(tx, orderId))
    ) {
      nextStatus = 'pending_shipment';
    }
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: nextStatus,
        refundedAmount: sql`${orders.refundedAmount} + ${record.amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'refunding')))
      .returning({ id: orders.id });
    if (!updatedOrder) {
      throw new BizError(
        'RETURN_STATUS_INVALID',
        '订单状态已变化，无法续记退款',
      );
    }

    await tx.insert(adminOperationLogs).values({
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.success',
      targetType: 'order',
      targetId: orderId,
      payload: {
        refundId: pending.refundId,
        amount: record.amount,
        isFullRefund: record.isFullRefund,
        items: lines.map((line) => ({
          orderItemId: line.orderItemId,
          quantity: line.quantity,
          amount: line.amount,
          restock: line.restock,
          printJobStatus: printJobByItem.get(line.orderItemId)?.status ?? null,
        })),
      },
      ip: context.ip,
    });
    if (context.returnRequestId) {
      const [completedRequest] = await tx
        .update(returnRequests)
        .set({
          status: 'completed',
          reviewRemark: '退款已完成，请留意原支付渠道到账情况',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(returnRequests.id, context.returnRequestId),
            eq(returnRequests.refundId, pending.refundId),
            eq(returnRequests.status, 'approved'),
          ),
        )
        .returning({ id: returnRequests.id });
      if (!completedRequest) {
        throw new BizError('RETURN_STATUS_INVALID', '售后申请无法完成退款落账');
      }
      await tx.insert(adminOperationLogs).values({
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'return.review.completed',
        targetType: 'return_request',
        targetId: context.returnRequestId,
        payload: { refundId: pending.refundId },
        ip: context.ip,
      });
    }
    return {
      id: pending.refundId,
      outRefundNo: record.outRefundNo,
      amount: toFixed2(record.amount),
      isFullRefund: record.isFullRefund,
      restock: record.restock,
      status: 'success',
      items: lines,
    };
  });
}

/** Shared item-level refund entry point for direct admin refunds and B3 approvals. */
export async function refundOrder(
  orderId: string,
  input: AdminOrderRefundInput,
  context: RefundContext,
  dependencies: RefundDependencies = {},
): Promise<RefundResult> {
  const prepared = await prepareRefund(orderId, input, context);
  if ('status' in prepared) return prepared;
  const pending = await acquireProcessingLease(prepared);

  let provider: PaymentProvider;
  try {
    provider = (dependencies.getProvider ?? getPaymentProvider)(
      pending.provider,
    );
  } catch (error: unknown) {
    await markManualReview(pending);
    throw error;
  }
  await callOrRecoverProvider(pending, provider);
  try {
    return await finalizeRefund(orderId, pending, context);
  } catch (error: unknown) {
    logger.error(
      { err: error, orderId, refundId: pending.refundId },
      'Provider refund succeeded but local refund commit failed; the refund requires continuation or manual review',
    );
    await markManualReview(pending);
    throw error;
  }
}

async function markRefundFailed(
  pending: PendingRefund,
  reason?: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${pending.orderId}))`,
    );
    const [failed] = await tx
      .update(refunds)
      .set({
        status: 'failed',
        needsManualReview: false,
        processingToken: null,
        processingUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refunds.id, pending.refundId),
          eq(refunds.status, 'pending'),
          sql`${refunds.providerConfirmedAt} IS NULL`,
          eq(refunds.processingToken, pending.attemptToken!),
        ),
      )
      .returning({ orderId: refunds.orderId });
    if (!failed) {
      logger.error(
        { refundId: pending.refundId },
        'Failed to mark a rejected refund because the processing lease was lost',
      );
      return;
    }
    let nextStatus = pending.previousStatus;
    if (
      pending.previousStatus === 'in_production' &&
      (await isOrderProductionReady(tx, failed.orderId))
    ) {
      nextStatus = 'pending_shipment';
    }
    await tx
      .update(orders)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(
        and(eq(orders.id, failed.orderId), eq(orders.status, 'refunding')),
      );
    logger.warn({ refundId: pending.refundId, reason }, '支付渠道明确拒绝退款');
  });
}

export async function voidRefundAfterManualVerification(
  refundId: string,
  conclusion: string,
  context: RefundContext,
  dependencies: RefundDependencies = {},
): Promise<{ id: string; status: 'failed'; orderStatus: string }> {
  const [target] = await getDb()
    .select({
      orderId: refunds.orderId,
      paymentId: refunds.paymentId,
      provider: payments.provider,
      outTradeNo: payments.outTradeNo,
      outRefundNo: refunds.outRefundNo,
      amount: refunds.amount,
      reason: refunds.reason,
      isFullRefund: refunds.isFullRefund,
      previousStatus: refunds.previousOrderStatus,
      providerConfirmedAt: refunds.providerConfirmedAt,
      status: refunds.status,
      needsManualReview: refunds.needsManualReview,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(refunds.id, refundId))
    .limit(1);
  if (!target) throw new BizError('NOT_FOUND', '退款记录不存在');
  if (target.providerConfirmedAt) {
    throw new BizError(
      'RETURN_STATUS_INVALID',
      '渠道已确认退款成功，只能续记本地账务，不能人工作废',
    );
  }
  if (target.status !== 'pending' || !target.needsManualReview) {
    throw new BizError(
      'RETURN_STATUS_INVALID',
      '只有待人工复核且渠道未确认的退款可以作废',
    );
  }
  if (!target.previousStatus) {
    throw new BizError('RETURN_STATUS_INVALID', '退款记录缺少订单恢复状态');
  }

  const attemptToken = crypto.randomUUID();
  const [leased] = await getDb()
    .update(refunds)
    .set({
      processingToken: attemptToken,
      processingUntil: processingLeaseUntil(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(refunds.id, refundId),
        eq(refunds.status, 'pending'),
        eq(refunds.needsManualReview, true),
        sql`${refunds.providerConfirmedAt} IS NULL`,
        sql`(${refunds.processingUntil} IS NULL OR ${refunds.processingUntil} < now())`,
      ),
    )
    .returning({ id: refunds.id });
  if (!leased) {
    throw new BizError('REFUND_IN_PROGRESS', '该退款正在处理，不能人工作废');
  }

  const pending: PendingRefund = {
    orderId: target.orderId,
    refundId,
    paymentId: target.paymentId,
    provider: paymentProviderCode(target.provider),
    outTradeNo: target.outTradeNo,
    outRefundNo: target.outRefundNo,
    amount: target.amount,
    reason: target.reason ?? '',
    isFullRefund: target.isFullRefund,
    previousStatus: target.previousStatus,
    providerConfirmedAt: null,
    attemptToken,
    created: false,
  };
  const provider =
    dependencies.getProvider?.(pending.provider) ??
    getPaymentProvider(pending.provider);
  let queryResult: Awaited<ReturnType<PaymentProvider['queryRefund']>>;
  try {
    queryResult = await queryProviderRefund(pending, provider);
  } catch (error: unknown) {
    await markManualReview(pending);
    logger.warn(
      { err: error, refundId },
      'Manual refund void query failed; keeping the refund for manual review',
    );
    throw new BizError(
      'REFUND_MANUAL_REVIEW_REQUIRED',
      '渠道查询失败，无法确认未出款，退款仍需人工复核',
    );
  }

  if (queryResult.status === 'pending') {
    await markManualReview(pending);
    throw new BizError(
      'REFUND_MANUAL_REVIEW_REQUIRED',
      '渠道退款结果尚未确认，不能人工作废',
    );
  }
  if (queryResult.status === 'success') {
    await markProviderConfirmed(pending, queryResult.providerRefundId);
    const [linkedRequest] = await getDb()
      .select({ id: returnRequests.id })
      .from(returnRequests)
      .where(
        and(
          eq(returnRequests.refundId, refundId),
          eq(returnRequests.status, 'approved'),
        ),
      )
      .limit(1);
    try {
      await finalizeRefund(
        pending.orderId,
        pending,
        linkedRequest
          ? { ...context, returnRequestId: linkedRequest.id }
          : context,
      );
    } catch (error: unknown) {
      logger.error(
        { err: error, refundId },
        'Provider confirmed refund during manual void but local continuation failed',
      );
      await markManualReview(pending);
      throw error;
    }
    throw new BizError(
      'RETURN_STATUS_INVALID',
      '渠道已确认退款成功，已续记本地账务，不能人工作废',
    );
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${target.orderId}))`,
    );
    const [failed] = await tx
      .update(refunds)
      .set({
        status: 'failed',
        needsManualReview: false,
        processingToken: null,
        processingUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refunds.id, refundId),
          eq(refunds.status, 'pending'),
          eq(refunds.needsManualReview, true),
          sql`${refunds.providerConfirmedAt} IS NULL`,
          eq(refunds.processingToken, attemptToken),
        ),
      )
      .returning({ id: refunds.id });
    if (!failed) {
      throw new BizError('REFUND_IN_PROGRESS', '退款处理权已变化，不能人工作废');
    }
    let orderStatus = pending.previousStatus;
    if (
      pending.previousStatus === 'in_production' &&
      (await isOrderProductionReady(tx, target.orderId))
    ) {
      orderStatus = 'pending_shipment';
    }
    await tx
      .update(orders)
      .set({ status: orderStatus, updatedAt: new Date() })
      .where(
        and(eq(orders.id, target.orderId), eq(orders.status, 'refunding')),
      );
    const rejectedRequests = await tx
      .update(returnRequests)
      .set({
        status: 'rejected',
        reviewRemark: '经核实渠道未出款，本次售后申请已结束',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(returnRequests.refundId, refundId),
          eq(returnRequests.status, 'approved'),
        ),
      )
      .returning({ id: returnRequests.id });
    await tx.insert(adminOperationLogs).values({
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.void_manual',
      targetType: 'order',
      targetId: target.orderId,
      payload: {
        refundId,
        conclusion,
        restoredOrderStatus: orderStatus,
        returnRequestIds: rejectedRequests.map((request) => request.id),
      },
      ip: context.ip,
    });
    return { id: refundId, status: 'failed', orderStatus };
  });
}

/** Continue a persisted pending refund without accepting an idempotency key from the client. */
export async function resumeRefund(
  refundId: string,
  context: RefundContext,
  dependencies: RefundDependencies = {},
): Promise<RefundResult> {
  const [record] = await getDb()
    .select({
      orderId: refunds.orderId,
      idempotencyKey: refunds.idempotencyKey,
      reason: refunds.reason,
      status: refunds.status,
      originalOperatorId: refunds.operatorId,
    })
    .from(refunds)
    .where(eq(refunds.id, refundId))
    .limit(1);
  if (!record) throw new BizError('NOT_FOUND', '退款记录不存在');
  if (!record.idempotencyKey) {
    throw new BizError(
      'RETURN_STATUS_INVALID',
      '历史退款缺少幂等键，必须转人工复核',
    );
  }
  if (record.status === 'failed') {
    throw new BizError('REFUND_REJECTED', '退款已被渠道明确拒绝，请重新发起');
  }
  const lines = await loadRefundLines(getDb(), refundId);
  if (!lines.length) {
    throw new BizError('RETURN_STATUS_INVALID', '退款记录缺少商品明细');
  }
  const [linkedRequest] = await getDb()
    .select({ id: returnRequests.id })
    .from(returnRequests)
    .where(
      and(
        eq(returnRequests.refundId, refundId),
        eq(returnRequests.status, 'approved'),
      ),
    )
    .limit(1);
  await getDb()
    .insert(adminOperationLogs)
    .values({
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.resume',
      targetType: 'order',
      targetId: record.orderId,
      payload: {
        refundId,
        originalOperatorId: record.originalOperatorId,
        resumedBy: context.admin.sub,
      },
      ip: context.ip,
    });
  return refundOrder(
    record.orderId,
    {
      idempotencyKey: record.idempotencyKey,
      reason: record.reason ?? '',
      items: lines.map((line) => ({
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        restock: line.restock,
      })),
    },
    linkedRequest ? { ...context, returnRequestId: linkedRequest.id } : context,
    dependencies,
  );
}
