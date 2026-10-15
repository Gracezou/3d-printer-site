import { describe, expect, it } from 'vitest';

import {
  classifyMailFailure,
  renderBusinessEmail,
} from './business-email.service';

describe('business email templates', () => {
  const origin = 'https://stage.example.com';
  const orderPayload = {
    orderNo: '20261015000001',
    path: '/account/orders/20261015000001',
  };

  it('renders order and return links without private address data', () => {
    const paid = renderBusinessEmail('payment_paid', orderPayload, origin);
    expect(paid.subject).toContain('支付成功');
    expect(paid.text).toContain(
      'https://stage.example.com/account/orders/20261015000001',
    );
    const rejected = renderBusinessEmail(
      'return_rejected',
      { ...orderPayload, requestNo: 'R-001' },
      origin,
    );
    expect(rejected.text).toContain('R-001');
    expect(rejected.text).toContain('订单中心');
  });

  it('rejects external or protocol-relative paths', () => {
    expect(() =>
      renderBusinessEmail('model_opened', { path: '//evil.example' }, origin),
    ).toThrow('Invalid business email path');
    expect(() =>
      renderBusinessEmail(
        'model_opened',
        { path: 'https://evil.example' },
        origin,
      ),
    ).toThrow('Invalid business email path');
  });
});

describe('SMTP outcomes', () => {
  it('retries explicit temporary rejection, stops permanent rejection, and quarantines unknown delivery', () => {
    expect(classifyMailFailure({ responseCode: 451 })).toBe('retryable');
    expect(classifyMailFailure({ responseCode: 550 })).toBe('permanent');
    expect(classifyMailFailure(new Error('socket timed out'))).toBe('unknown');
  });
});
