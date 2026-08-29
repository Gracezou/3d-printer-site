import { Buffer } from 'node:buffer';

import { AlipaySdk } from 'alipay-sdk';

import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import type { PaymentProvider } from './provider.interface';

function normalizeEnvKey(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

function privateKeyType(value: string): 'PKCS1' | 'PKCS8' {
  const normalized = normalizeEnvKey(value);
  if (normalized.includes('BEGIN RSA PRIVATE KEY')) return 'PKCS1';
  if (normalized.includes('BEGIN PRIVATE KEY')) return 'PKCS8';
  try {
    const head = Buffer.from(normalized.replace(/\s+/g, ''), 'base64')
      .subarray(0, 64)
      .toString('hex');
    return head.includes('2a864886f70d010101') ? 'PKCS8' : 'PKCS1';
  } catch {
    return 'PKCS8';
  }
}

function createSdk(): AlipaySdk {
  const appId = process.env.ALIPAY_APP_ID?.trim();
  const privateKey = process.env.ALIPAY_PRIVATE_KEY?.trim();
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY?.trim();
  if (!appId || !privateKey || !alipayPublicKey) {
    throw new BizError('PAYMENT_PROVIDER_ERROR', '支付宝配置不完整');
  }
  return new AlipaySdk({
    appId,
    privateKey: normalizeEnvKey(privateKey),
    alipayPublicKey: normalizeEnvKey(alipayPublicKey),
    gateway:
      process.env.ALIPAY_GATEWAY?.trim() ||
      'https://openapi.alipay.com/gateway.do',
    signType: 'RSA2',
    keyType: privateKeyType(privateKey),
    camelcase: true,
    timeout: 10_000,
  });
}

function paymentError(message: string, error: unknown): never {
  logger.error({ err: error }, message);
  throw new BizError('PAYMENT_PROVIDER_ERROR', message);
}

export class AlipayPageProvider implements PaymentProvider {
  readonly code = 'alipay_page' as const;

  private readonly sdk: AlipaySdk;

  constructor(sdk?: AlipaySdk) {
    this.sdk = sdk ?? createSdk();
  }

  async createPayment(params: {
    outTradeNo: string;
    amount: string;
    subject: string;
    notifyUrl: string;
    returnUrl: string;
  }): Promise<{ payUrl: string }> {
    try {
      const payUrl = this.sdk.pageExecute('alipay.trade.page.pay', 'GET', {
        notifyUrl: params.notifyUrl,
        returnUrl: params.returnUrl,
        bizContent: {
          outTradeNo: params.outTradeNo,
          productCode: 'FAST_INSTANT_TRADE_PAY',
          totalAmount: params.amount,
          subject: params.subject.slice(0, 128),
          timeoutExpress: '30m',
        },
      });
      return { payUrl };
    } catch (error: unknown) {
      paymentError('创建支付宝支付失败', error);
    }
  }

  async queryPayment(outTradeNo: string) {
    try {
      const result = await this.sdk.exec('alipay.trade.query', {
        bizContent: { outTradeNo },
      });
      if (result.code !== '10000') {
        if (result.subCode === 'ACQ.TRADE_NOT_EXIST') {
          return { status: 'pending' as const };
        }
        throw new Error(result.subMsg || result.msg || '支付宝查询失败');
      }
      const tradeStatus = String(result.tradeStatus ?? '');
      const status = ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(tradeStatus)
        ? ('success' as const)
        : tradeStatus === 'TRADE_CLOSED'
          ? ('closed' as const)
          : ('pending' as const);
      return {
        status,
        providerTxnId: result.tradeNo ? String(result.tradeNo) : undefined,
        paidAmount: result.totalAmount ? String(result.totalAmount) : undefined,
      };
    } catch (error: unknown) {
      paymentError('查询支付宝支付状态失败', error);
    }
  }

  async verifyNotify(rawBody: string | Record<string, string>) {
    const params =
      typeof rawBody === 'string'
        ? Object.fromEntries(new URLSearchParams(rawBody))
        : rawBody;
    try {
      return {
        valid: this.sdk.checkNotifySignV2(params),
        outTradeNo: params.out_trade_no,
        providerTxnId: params.trade_no,
        amount: params.total_amount,
        tradeStatus: params.trade_status,
        raw: params,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, '支付宝异步通知验签异常');
      return { valid: false, raw: params };
    }
  }

  async refund(params: {
    outTradeNo: string;
    outRefundNo: string;
    amount: string;
    reason: string;
  }) {
    try {
      const result = await this.sdk.exec('alipay.trade.refund', {
        bizContent: {
          outTradeNo: params.outTradeNo,
          outRequestNo: params.outRefundNo,
          refundAmount: params.amount,
          refundReason: params.reason,
        },
      });
      return {
        success: result.code === '10000',
        providerRefundId: result.tradeNo ? String(result.tradeNo) : undefined,
        message:
          result.code === '10000'
            ? undefined
            : String(result.subMsg || result.msg || '支付宝退款失败'),
      };
    } catch (error: unknown) {
      paymentError('支付宝退款请求失败', error);
    }
  }
}
