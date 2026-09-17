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
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import type { DbTransaction } from '@/lib/services/admin-log.service';
import { allocateRefund } from '@/lib/services/refund-allocation';
import { getPaymentProvider } from '@/lib/services/payment/provider.factory';
import type {
  PaymentProvider,
  PaymentProviderCode,
} from '@/lib/services/payment/provider.interface';
import {
  lockRefundStockMaterials,
  returnRefundItemStock,
} from '@/lib/services/refund-stock.service';
import { releaseDiscount } from '@/lib/services/promotion.service';
import type { AdminOrderRefundInput } from '@/lib/validators/admin-order';

interface RefundContext {
  admin: AdminIdentity;
  ip: string;
}

interface PendingRefund {
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
      .where(eq(refunds.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (sameKey) {
      if (sameKey.orderId !== orderId) {
        throw new BizError('PARAM_INVALID', '幂等键已用于其他订单');
      }
      const lines = await loadRefundLines(tx, sameKey.id);
      if (!sameRequest(lines, input.items) || sameKey.reason !== input.reason) {
        throw new BizError('PARAM_INVALID', '幂等键对应的退款内容不一致');
      }
      if (sameKey.status === 'success') return existingResult(tx, sameKey);
      if (sameKey.status === 'failed') {
        throw new BizError(
          'RETURN_STATUS_INVALID',
          '该退款请求已失败，请使用新的幂等键重试',
        );
      }
      if (!sameKey.previousStatus) {
        throw new BizError('INTERNAL_ERROR', '退款记录缺少订单恢复状态');
      }
      return {
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
        operatorId: context.admin.sub,
      })
      .returning({ id: refunds.id });
    if (!record) throw new BizError('INTERNAL_ERROR', '创建退款记录失败');

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
        items: input.items,
      },
      ip: context.ip,
    });
    return {
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
      created: true,
    };
  });
}

async function markProviderConfirmed(
  refundId: string,
  providerRefundId?: string,
): Promise<void> {
  await getDb()
    .update(refunds)
    .set({
      providerRefundId,
      providerConfirmedAt: new Date(),
      needsManualReview: false,
      updatedAt: new Date(),
    })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, 'pending')));
}

async function markManualReview(refundId: string): Promise<void> {
  await getDb()
    .update(refunds)
    .set({ needsManualReview: true, updatedAt: new Date() })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, 'pending')));
}

async function callOrRecoverProvider(
  pending: PendingRefund,
  provider: PaymentProvider,
): Promise<void> {
  if (pending.providerConfirmedAt) return;

  if (!pending.created) {
    let queried;
    try {
      queried = await provider.queryRefund({
        outTradeNo: pending.outTradeNo,
        outRefundNo: pending.outRefundNo,
      });
    } catch (error: unknown) {
      await markManualReview(pending.refundId);
      throw error;
    }
    if (queried.status === 'success') {
      await markProviderConfirmed(pending.refundId, queried.providerRefundId);
      return;
    }
    if (queried.status === 'pending') {
      await markManualReview(pending.refundId);
      throw new BizError(
        'PAYMENT_PROVIDER_ERROR',
        '支付渠道退款结果待确认，请稍后使用原幂等键重试',
      );
    }
  }

  let result;
  try {
    result = await provider.refund({
      outTradeNo: pending.outTradeNo,
      outRefundNo: pending.outRefundNo,
      amount: pending.amount,
      reason: pending.reason,
    });
  } catch (error: unknown) {
    try {
      const queried = await provider.queryRefund({
        outTradeNo: pending.outTradeNo,
        outRefundNo: pending.outRefundNo,
      });
      if (queried.status === 'success') {
        await markProviderConfirmed(pending.refundId, queried.providerRefundId);
        return;
      }
    } catch (queryError: unknown) {
      logger.error(
        { err: queryError, refundId: pending.refundId },
        '退款请求异常后查询渠道结果失败',
      );
    }
    await markManualReview(pending.refundId);
    throw error;
  }
  if (!result.success) {
    await markRefundFailed(
      pending.refundId,
      pending.previousStatus,
      result.message,
    );
    throw new BizError(
      'PAYMENT_PROVIDER_ERROR',
      result.message || '支付渠道退款失败',
    );
  }
  await markProviderConfirmed(pending.refundId, result.providerRefundId);
}

async function finalizeRefund(
  orderId: string,
  refundId: string,
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
      })
      .from(refunds)
      .where(eq(refunds.id, refundId))
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

    const lines = await loadRefundLines(tx, refundId);
    const [updatedRefund] = await tx
      .update(refunds)
      .set({
        status: 'success',
        needsManualReview: false,
        updatedAt: new Date(),
      })
      .where(and(eq(refunds.id, refundId), eq(refunds.status, 'pending')))
      .returning({ id: refunds.id });
    if (!updatedRefund) {
      throw new BizError('RETURN_STATUS_INVALID', '退款记录已被处理');
    }

    const nextStatus = record.isFullRefund
      ? 'refunded'
      : (record.previousStatus ?? 'paid');
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: nextStatus,
        refundedAmount: sql`${orders.refundedAmount} + ${record.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, 'refunding'),
          sql`${orders.refundedAmount} + ${record.amount} <= ${orders.paidAmount}`,
        ),
      )
      .returning({ id: orders.id });
    if (!updatedOrder) {
      throw new BizError('RETURN_AMOUNT_EXCEEDED', '退款金额超过订单可退余额');
    }

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
    const refundedItemIds = lines.map((line) => line.orderItemId);
    if (refundedItemIds.length) {
      await tx
        .delete(printJobs)
        .where(
          and(
            inArray(printJobs.orderItemId, refundedItemIds),
            eq(printJobs.status, 'queued'),
          ),
        );
    }
    if (record.isFullRefund) await releaseDiscount(tx, orderId);

    await tx.insert(adminOperationLogs).values({
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.success',
      targetType: 'order',
      targetId: orderId,
      payload: {
        refundId,
        amount: record.amount,
        isFullRefund: record.isFullRefund,
        items: lines.map((line) => ({
          orderItemId: line.orderItemId,
          quantity: line.quantity,
          amount: line.amount,
          restock: line.restock,
        })),
      },
      ip: context.ip,
    });
    return {
      id: refundId,
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
  dependencies: {
    getProvider?: (code: PaymentProviderCode) => PaymentProvider;
  } = {},
): Promise<RefundResult> {
  const prepared = await prepareRefund(orderId, input, context);
  if ('status' in prepared) return prepared;

  let provider: PaymentProvider;
  try {
    provider = (dependencies.getProvider ?? getPaymentProvider)(
      prepared.provider,
    );
  } catch (error: unknown) {
    await markManualReview(prepared.refundId);
    throw error;
  }
  await callOrRecoverProvider(prepared, provider);
  try {
    return await finalizeRefund(orderId, prepared.refundId, context);
  } catch (error: unknown) {
    logger.error(
      { err: error, orderId, refundId: prepared.refundId },
      'Provider refund succeeded but local refund commit failed; retry with the same idempotency key',
    );
    throw error;
  }
}

async function markRefundFailed(
  refundId: string,
  previousStatus: string,
  reason?: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [failed] = await tx
      .update(refunds)
      .set({
        status: 'failed',
        needsManualReview: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refunds.id, refundId),
          eq(refunds.status, 'pending'),
          sql`${refunds.providerConfirmedAt} IS NULL`,
        ),
      )
      .returning({ orderId: refunds.orderId });
    if (!failed) return;
    await tx
      .update(orders)
      .set({ status: previousStatus, updatedAt: new Date() })
      .where(
        and(eq(orders.id, failed.orderId), eq(orders.status, 'refunding')),
      );
    logger.warn({ refundId, reason }, '支付渠道明确拒绝退款');
  });
}
