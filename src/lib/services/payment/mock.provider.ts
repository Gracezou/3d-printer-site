import type { PaymentProvider } from './provider.interface';

export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock' as const;
  private readonly refunds = new Map<string, string>();

  async createPayment(params: {
    outTradeNo: string;
    amount: string;
    subject: string;
    notifyUrl: string;
    returnUrl: string;
  }): Promise<{ payUrl: string }> {
    const url = new URL('/checkout/pay/mock', params.returnUrl);
    url.searchParams.set('outTradeNo', params.outTradeNo);
    url.searchParams.set('amount', params.amount);
    return { payUrl: url.toString() };
  }

  async queryPayment(): Promise<{ status: 'pending' }> {
    return { status: 'pending' };
  }

  async verifyNotify(rawBody: string | Record<string, string>) {
    const raw =
      typeof rawBody === 'string'
        ? Object.fromEntries(new URLSearchParams(rawBody))
        : rawBody;
    return {
      valid: raw.mock_signature === 'valid',
      outTradeNo: raw.out_trade_no,
      providerTxnId: raw.trade_no,
      amount: raw.total_amount,
      tradeStatus: raw.trade_status,
      raw,
    };
  }

  async refund(params: {
    outTradeNo: string;
    outRefundNo: string;
    amount: string;
    reason: string;
  }): Promise<{ success: true; providerRefundId: string }> {
    const existing = this.refunds.get(params.outRefundNo);
    const providerRefundId = existing ?? `MOCK-REFUND-${crypto.randomUUID()}`;
    this.refunds.set(params.outRefundNo, providerRefundId);
    return {
      success: true,
      providerRefundId,
    };
  }

  async queryRefund(params: { outRefundNo: string }) {
    const providerRefundId = this.refunds.get(params.outRefundNo);
    return providerRefundId
      ? { status: 'success' as const, providerRefundId }
      : { status: 'not_found' as const };
  }
}
