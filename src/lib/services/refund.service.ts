import Decimal from 'decimal.js';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import { orders, payments, refunds } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import { withAdminLog } from '@/lib/services/admin-log.service';
import { getPaymentProvider } from '@/lib/services/payment/provider.factory';
import type { PaymentProviderCode } from '@/lib/services/payment/provider.interface';
import { releaseDiscount } from '@/lib/services/promotion.service';
import type { AdminOrderRefundInput } from '@/lib/validators/admin-order';

interface RefundContext {
  admin: AdminIdentity;
  ip: string;
}

const refundableOrderStatuses = [
  'paid',
  'in_production',
  'pending_shipment',
  'shipped',
  'completed',
  'refunded',
] as const;

function paymentProviderCode(value: string): PaymentProviderCode {
  if (value === 'alipay_page' || value === 'mock') return value;
  throw new BizError('PAYMENT_PROVIDER_ERROR', '该支付渠道暂不支持退款');
}

export async function refundOrder(
  orderId: string,
  input: AdminOrderRefundInput,
  context: RefundContext,
) {
  const pending = await withAdminLog(
    async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);
      const [order] = await tx
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          status: orders.status,
          payableAmount: orders.payableAmount,
          paidAmount: orders.paidAmount,
          refundedAmount: orders.refundedAmount,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order) throw new BizError('NOT_FOUND', '订单不存在');
      if (
        !refundableOrderStatuses.includes(
          order.status as (typeof refundableOrderStatuses)[number],
        )
      ) {
        throw new BizError('ORDER_STATUS_INVALID', '当前订单状态不可退款');
      }
      const [existingPending] = await tx
        .select({ id: refunds.id })
        .from(refunds)
        .where(and(eq(refunds.orderId, orderId), eq(refunds.status, 'pending')))
        .limit(1);
      if (existingPending) {
        throw new BizError('ORDER_STATUS_INVALID', '该订单有退款正在处理');
      }
      const remaining = new Decimal(order.paidAmount).minus(
        order.refundedAmount,
      );
      const amount = new Decimal(input.amount);
      if (amount.gt(remaining)) {
        throw new BizError(
          'PARAM_INVALID',
          `退款金额不能超过可退金额 ¥${toFixed2(remaining)}`,
        );
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
      const isFullRefund = amount.equals(order.payableAmount);
      const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
      const outRefundNo = `R${order.orderNo}-${nonce}`;
      const [record] = await tx
        .insert(refunds)
        .values({
          orderId,
          paymentId: payment.id,
          outRefundNo,
          amount: toFixed2(amount),
          isFullRefund,
          restock: isFullRefund && input.restock,
          reason: input.reason,
          operatorId: context.admin.sub,
        })
        .returning({ id: refunds.id });
      if (!record) throw new BizError('INTERNAL_ERROR', '创建退款记录失败');
      await tx
        .update(orders)
        .set({ status: 'refunding', updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      return {
        refundId: record.id,
        paymentId: payment.id,
        provider: paymentProviderCode(payment.provider),
        outTradeNo: payment.outTradeNo,
        outRefundNo,
        amount: toFixed2(amount),
        reason: input.reason,
        isFullRefund,
        restock: isFullRefund && input.restock,
        previousStatus: order.status,
      };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.refund.request',
      targetType: 'order',
      targetId: orderId,
      payload: {
        amount: input.amount,
        reason: input.reason,
        restock: input.restock,
      },
      ip: context.ip,
    },
  );

  let providerResult: Awaited<
    ReturnType<ReturnType<typeof getPaymentProvider>['refund']>
  >;
  try {
    providerResult = await getPaymentProvider(pending.provider).refund({
      outTradeNo: pending.outTradeNo,
      outRefundNo: pending.outRefundNo,
      amount: pending.amount,
      reason: pending.reason,
    });
  } catch (error: unknown) {
    await markRefundFailed(pending.refundId, orderId, pending.previousStatus);
    throw error;
  }
  if (!providerResult.success) {
    await markRefundFailed(pending.refundId, orderId, pending.previousStatus);
    throw new BizError(
      'PAYMENT_PROVIDER_ERROR',
      providerResult.message || '支付渠道退款失败',
    );
  }

  try {
    return await withAdminLog(
      async (tx) => {
        const [updatedRefund] = await tx
          .update(refunds)
          .set({
            status: 'success',
            providerRefundId: providerResult.providerRefundId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(refunds.id, pending.refundId),
              eq(refunds.status, 'pending'),
            ),
          )
          .returning({ id: refunds.id });
        if (!updatedRefund) {
          throw new BizError('ORDER_STATUS_INVALID', '退款记录已被处理');
        }
        await tx
          .update(orders)
          .set({
            status: 'refunded',
            refundedAmount: sql`${orders.refundedAmount} + ${pending.amount}`,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));
        if (pending.isFullRefund) {
          await tx
            .update(payments)
            .set({ status: 'refunded', updatedAt: new Date() })
            .where(eq(payments.id, pending.paymentId));
          if (pending.restock) {
            await tx.execute(
              sql`SELECT fn_refund_return_stock(${orderId}::uuid, ${context.admin.sub}::uuid)`,
            );
          }
          await releaseDiscount(tx, orderId);
        }
        return {
          id: pending.refundId,
          outRefundNo: pending.outRefundNo,
          amount: pending.amount,
          isFullRefund: pending.isFullRefund,
          restock: pending.restock,
          status: 'success' as const,
        };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'order.refund.success',
        targetType: 'order',
        targetId: orderId,
        payload: {
          refundId: pending.refundId,
          amount: pending.amount,
          isFullRefund: pending.isFullRefund,
          restock: pending.restock,
        },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    logger.error(
      { err: error, orderId, refundId: pending.refundId },
      'Provider refund succeeded but local refund commit failed',
    );
    throw error;
  }
}

async function markRefundFailed(
  refundId: string,
  orderId: string,
  previousStatus: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .update(refunds)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(refunds.id, refundId), eq(refunds.status, 'pending')));
    await tx
      .update(orders)
      .set({ status: previousStatus, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'refunding')));
  });
}
