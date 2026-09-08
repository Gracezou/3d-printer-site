import Decimal from 'decimal.js';
import { and, eq, ne, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import {
  discountRedemptions,
  orderItems,
  orders,
  payments,
  printJobs,
} from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import type { PaymentProvider } from '@/lib/services/payment/provider.interface';

export type NotifyResponse = 'success' | 'failure';

interface VerifiedPayment {
  outTradeNo: string;
  providerTxnId: string;
  amount: string;
  raw: Record<string, unknown>;
}

async function commitVerifiedPayment(
  provider: PaymentProvider,
  verified: VerifiedPayment,
): Promise<NotifyResponse> {
  const { outTradeNo } = verified;

  // 支付记录必须存在。
  const [payment] = await getDb()
    .select({
      id: payments.id,
      orderId: payments.orderId,
      amount: payments.amount,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(
        eq(payments.outTradeNo, outTradeNo),
        eq(payments.provider, provider.code),
      ),
    )
    .limit(1);
  if (!payment) {
    logger.warn({ outTradeNo, provider: provider.code }, 'Payment not found');
    return 'failure';
  }

  // 金额以 DECIMAL 字符串精确比较。
  if (!new Decimal(payment.amount).equals(verified.amount)) {
    logger.error(
      {
        paymentId: payment.id,
        outTradeNo,
        expectedAmount: payment.amount,
        confirmedAmount: verified.amount,
      },
      'Payment confirmation amount mismatch',
    );
    return 'failure';
  }

  // 已成功记录直接返回，保证通知和主动查询均幂等。
  if (payment.status === 'success') return 'success';

  // 支付、订单、库存、折扣和生产任务处于同一事务。
  try {
    const result = await getDb().transaction(async (tx) => {
      const paidAt = new Date();
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: 'success',
          providerTxnId: verified.providerTxnId,
          paidAt,
          rawNotify: verified.raw,
          updatedAt: paidAt,
        })
        .where(and(eq(payments.id, payment.id), ne(payments.status, 'success')))
        .returning({ id: payments.id });
      if (!updatedPayment) return { duplicate: true, manualReview: false };

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: 'in_production',
          paidAt,
          paidAmount: payment.amount,
          reservedUntil: null,
          updatedAt: paidAt,
        })
        .where(
          and(
            eq(orders.id, payment.orderId),
            eq(orders.status, 'pending_payment'),
          ),
        )
        .returning({ id: orders.id });
      if (!updatedOrder) {
        await tx
          .update(payments)
          .set({ needsManualReview: true, updatedAt: paidAt })
          .where(eq(payments.id, payment.id));
        return { duplicate: false, manualReview: true };
      }

      await tx.execute(
        sql`SELECT fn_commit_order_stock(${payment.orderId}::uuid)`,
      );
      await tx
        .update(discountRedemptions)
        .set({ status: 'confirmed' })
        .where(
          and(
            eq(discountRedemptions.orderId, payment.orderId),
            eq(discountRedemptions.status, 'occupied'),
          ),
        );
      const items = await tx
        .select({
          orderItemId: orderItems.id,
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, payment.orderId));
      if (items.length) {
        await tx
          .insert(printJobs)
          .values(
            items.map((item) => ({
              orderId: payment.orderId,
              orderItemId: item.orderItemId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          )
          .onConflictDoNothing({ target: printJobs.orderItemId });
      }
      return { duplicate: false, manualReview: false };
    });

    if (result.manualReview) {
      logger.error(
        { paymentId: payment.id, orderId: payment.orderId, outTradeNo },
        'Payment arrived after order became unavailable; manual review required',
      );
    } else if (!result.duplicate) {
      logger.info(
        { paymentId: payment.id, orderId: payment.orderId, outTradeNo },
        'Payment confirmation committed',
      );
    }
    return 'success';
  } catch (error: unknown) {
    logger.error(
      { err: error, paymentId: payment.id, outTradeNo },
      'Payment confirmation transaction failed',
    );
    return 'failure';
  }
}

export async function reconcilePaymentQuery(
  provider: PaymentProvider,
  outTradeNo: string,
): Promise<'pending' | 'success' | 'closed' | 'failure'> {
  const queried = await provider.queryPayment(outTradeNo);
  if (queried.status !== 'success') return queried.status;
  if (!queried.providerTxnId || !queried.paidAmount) {
    logger.warn(
      { outTradeNo, provider: provider.code },
      'Payment query success fields missing',
    );
    return 'failure';
  }

  return commitVerifiedPayment(provider, {
    outTradeNo,
    providerTxnId: queried.providerTxnId,
    amount: queried.paidAmount,
    raw: { source: 'provider_query' },
  });
}

export async function processPaymentNotify(
  provider: PaymentProvider,
  rawBody: string | Record<string, string>,
): Promise<NotifyResponse> {
  // 1. 验签。
  const notification = await provider.verifyNotify(rawBody);
  if (!notification.valid) {
    logger.warn(
      { provider: provider.code },
      'Payment notify signature invalid',
    );
    return 'failure';
  }

  // 2. 非成功交易通知只确认接收，不改变业务状态。
  if (
    !['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(
      notification.tradeStatus ?? '',
    )
  ) {
    return 'success';
  }

  // 3. 支付宝应用 ID 必须匹配本方配置。
  if (
    provider.code === 'alipay_page' &&
    String(notification.raw.app_id ?? '') !== process.env.ALIPAY_APP_ID?.trim()
  ) {
    logger.warn({ provider: provider.code }, 'Payment notify app id mismatch');
    return 'failure';
  }

  const outTradeNo = notification.outTradeNo;
  if (!outTradeNo || !notification.amount || !notification.providerTxnId) {
    logger.warn({ provider: provider.code }, 'Payment notify fields missing');
    return 'failure';
  }

  return commitVerifiedPayment(provider, {
    outTradeNo,
    providerTxnId: notification.providerTxnId,
    amount: notification.amount,
    raw: notification.raw,
  });
}
