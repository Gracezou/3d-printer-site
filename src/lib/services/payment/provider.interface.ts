export type PaymentProviderCode = 'alipay_page' | 'wechat_native' | 'mock';

export interface PaymentProvider {
  readonly code: PaymentProviderCode;

  createPayment(params: {
    outTradeNo: string;
    amount: string;
    subject: string;
    notifyUrl: string;
    returnUrl: string;
  }): Promise<{ payUrl?: string; qrCode?: string }>;

  queryPayment(outTradeNo: string): Promise<{
    status: 'pending' | 'success' | 'closed';
    providerTxnId?: string;
    paidAmount?: string;
  }>;

  verifyNotify(rawBody: string | Record<string, string>): Promise<{
    valid: boolean;
    outTradeNo?: string;
    providerTxnId?: string;
    amount?: string;
    tradeStatus?: string;
    raw: Record<string, unknown>;
  }>;

  refund(params: {
    outTradeNo: string;
    outRefundNo: string;
    amount: string;
    reason: string;
  }): Promise<{
    success: boolean;
    providerRefundId?: string;
    message?: string;
  }>;
}
