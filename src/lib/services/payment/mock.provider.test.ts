import { afterEach, describe, expect, it } from 'vitest';

import { BizError } from '@/lib/errors';

import { MockPaymentProvider } from './mock.provider';
import { getPaymentProvider } from './provider.factory';

const previousMockSetting = process.env.ENABLE_MOCK_PAYMENT;

afterEach(() => {
  process.env.ENABLE_MOCK_PAYMENT = previousMockSetting;
});

describe('MockPaymentProvider', () => {
  it('creates a local confirmation URL without converting amount to number', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createPayment({
      outTradeNo: 'ORDER-001',
      amount: '118.00',
      subject: '测试订单',
      notifyUrl: 'http://localhost:5003/api/payments/mock/notify',
      returnUrl: 'http://localhost:5003/checkout/pay/ORDER-001',
    });
    expect(result.payUrl).toContain('/checkout/pay/mock');
    expect(result.payUrl).toContain('amount=118.00');
  });

  it('is only registered when explicitly enabled', () => {
    process.env.ENABLE_MOCK_PAYMENT = 'false';
    expect(() => getPaymentProvider('mock')).toThrow(BizError);
    process.env.ENABLE_MOCK_PAYMENT = 'true';
    expect(getPaymentProvider('mock').code).toBe('mock');
  });
});
