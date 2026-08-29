import { BizError } from '@/lib/errors';

import { AlipayPageProvider } from './alipay.provider';
import { MockPaymentProvider } from './mock.provider';
import type {
  PaymentProvider,
  PaymentProviderCode,
} from './provider.interface';

let alipayProvider: AlipayPageProvider | undefined;
let mockProvider: MockPaymentProvider | undefined;

export function getPaymentProvider(code: PaymentProviderCode): PaymentProvider {
  if (code === 'alipay_page') {
    alipayProvider ??= new AlipayPageProvider();
    return alipayProvider;
  }
  if (code === 'mock' && process.env.ENABLE_MOCK_PAYMENT === 'true') {
    mockProvider ??= new MockPaymentProvider();
    return mockProvider;
  }
  throw new BizError('PAYMENT_PROVIDER_ERROR', '支付渠道未启用');
}

export function getDefaultPaymentProvider(): PaymentProvider {
  return process.env.ENABLE_MOCK_PAYMENT === 'true'
    ? getPaymentProvider('mock')
    : getPaymentProvider('alipay_page');
}
