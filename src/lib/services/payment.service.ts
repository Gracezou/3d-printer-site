import { and, desc, eq, gt, inArray } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { orders, payments } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getPaymentProvider } from '@/lib/services/payment/provider.factory';
import type { PaymentProviderCode } from '@/lib/services/payment/provider.interface';
import { processPaymentNotify } from '@/lib/services/payment-notify.service';

function configuredProviderCode(): PaymentProviderCode {
  return process.env.ENABLE_MOCK_PAYMENT === 'true' ? 'mock' : 'alipay_page';
}

function paymentUrls(code: PaymentProviderCode): {
  notifyUrl: string;
  returnUrl: string;
} {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5003'
  ).replace(/\/$/, '');
  if (code === 'mock') {
    return {
      notifyUrl: `${siteUrl}/api/payments/mock/notify`,
      returnUrl: `${siteUrl}/checkout/pay/result`,
    };
  }
  const notifyUrl = process.env.ALIPAY_NOTIFY_URL?.trim();
  const returnUrl = process.env.ALIPAY_RETURN_URL?.trim();
  if (!notifyUrl || !returnUrl) {
    throw new BizError(
      'PAYMENT_PROVIDER_ERROR',
      '支付宝通知地址或返回地址未配置',
    );
  }
  return { notifyUrl, returnUrl };
}

function newOutTradeNo(orderNo: string): string {
  return `${orderNo}-${Date.now().toString().slice(-6)}`;
}

export async function createPayment(
  userId: string,
  orderNo: string,
): Promise<{
  outTradeNo: string;
  payUrl: string;
  amount: string;
  reservedUntil: Date;
}> {
  const providerCode = configuredProviderCode();
  const urls = paymentUrls(providerCode);
  const created = await getDb().transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        payableAmount: orders.payableAmount,
        reservedUntil: orders.reservedUntil,
      })
      .from(orders)
      .where(
        and(
          eq(orders.orderNo, orderNo),
          eq(orders.userId, userId),
          eq(orders.status, 'pending_payment'),
          gt(orders.reservedUntil, new Date()),
        ),
      )
      .limit(1);
    if (!order) {
      const [existing] = await tx
        .select({ status: orders.status, reservedUntil: orders.reservedUntil })
        .from(orders)
        .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)))
        .limit(1);
      if (!existing) throw new BizError('NOT_FOUND', '订单不存在');
      if (
        existing.status === 'pending_payment' &&
        existing.reservedUntil &&
        existing.reservedUntil <= new Date()
      ) {
        throw new BizError('ORDER_EXPIRED', '订单支付时间已结束');
      }
      throw new BizError('ORDER_STATUS_INVALID', '当前订单状态不可支付');
    }

    await tx
      .update(payments)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(
        and(
          eq(payments.orderId, order.id),
          inArray(payments.status, ['created', 'pending']),
        ),
      );

    let outTradeNo = newOutTradeNo(order.orderNo);
    const [duplicate] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.outTradeNo, outTradeNo))
      .limit(1);
    if (duplicate) {
      outTradeNo = `${order.orderNo}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
    }
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        outTradeNo,
        provider: providerCode,
        amount: order.payableAmount,
      })
      .returning({ id: payments.id });
    if (!payment) throw new BizError('INTERNAL_ERROR', '创建支付记录失败');
    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNo: order.orderNo,
      amount: order.payableAmount,
      reservedUntil: order.reservedUntil!,
      outTradeNo,
    };
  });

  try {
    const provider = getPaymentProvider(providerCode);
    const result = await provider.createPayment({
      outTradeNo: created.outTradeNo,
      amount: created.amount,
      subject: `3D 打印订单 ${created.orderNo}`,
      notifyUrl: urls.notifyUrl,
      returnUrl: urls.returnUrl,
    });
    if (!result.payUrl) {
      throw new BizError('PAYMENT_PROVIDER_ERROR', '支付渠道未返回收银台地址');
    }
    logger.info(
      {
        orderId: created.orderId,
        paymentId: created.paymentId,
        provider: providerCode,
      },
      'Payment created',
    );
    return {
      outTradeNo: created.outTradeNo,
      payUrl: result.payUrl,
      amount: created.amount,
      reservedUntil: created.reservedUntil,
    };
  } catch (error: unknown) {
    await getDb()
      .update(payments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(payments.id, created.paymentId));
    throw error;
  }
}

export async function getPaymentStatus(userId: string, outTradeNo: string) {
  const [payment] = await getDb()
    .select({
      status: payments.status,
      orderStatus: orders.status,
      orderNo: orders.orderNo,
      reservedUntil: orders.reservedUntil,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.outTradeNo, outTradeNo), eq(orders.userId, userId)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) throw new BizError('NOT_FOUND', '支付记录不存在');
  const status =
    payment.status === 'success'
      ? ('success' as const)
      : ['closed', 'failed', 'refunded'].includes(payment.status)
        ? ('closed' as const)
        : ('pending' as const);
  return { ...payment, status };
}

export async function confirmMockPayment(userId: string, outTradeNo: string) {
  if (process.env.ENABLE_MOCK_PAYMENT !== 'true') {
    throw new BizError('PAYMENT_PROVIDER_ERROR', 'Mock 支付未启用');
  }
  const [payment] = await getDb()
    .select({ amount: payments.amount, provider: payments.provider })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.outTradeNo, outTradeNo), eq(orders.userId, userId)))
    .limit(1);
  if (!payment || payment.provider !== 'mock') {
    throw new BizError('NOT_FOUND', 'Mock 支付记录不存在');
  }
  const provider = getPaymentProvider('mock');
  const response = await processPaymentNotify(provider, {
    mock_signature: 'valid',
    out_trade_no: outTradeNo,
    trade_no: `MOCK-${crypto.randomUUID()}`,
    total_amount: payment.amount,
    trade_status: 'TRADE_SUCCESS',
  });
  if (response !== 'success') {
    throw new BizError('PAYMENT_PROVIDER_ERROR', 'Mock 支付确认失败');
  }
  return getPaymentStatus(userId, outTradeNo);
}
