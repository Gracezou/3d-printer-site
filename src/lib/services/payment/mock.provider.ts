import type { PaymentProvider } from './provider.interface';

export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock' as const;

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

  async refund(): Promise<{ success: true; providerRefundId: string }> {
    return {
      success: true,
      providerRefundId: `MOCK-REFUND-${crypto.randomUUID()}`,
    };
  }
}
