import { describe, expect, it } from 'vitest';

import {
  refundVoidErrorMessage,
  refundVoidSuccessMessage,
} from './refund-void-result';

describe('refund void result messages', () => {
  it('distinguishes a voided refund from provider-confirmed completion', () => {
    expect(refundVoidSuccessMessage('failed')).toBe(
      '退款已作废，订单状态已恢复',
    );
    expect(refundVoidSuccessMessage('success')).toBe(
      '渠道已确认出款，本地退款已完成落账',
    );
  });

  it('explains cooldown and continued manual review states', () => {
    expect(refundVoidErrorMessage(40920, '请稍后重试')).toBe(
      '退款仍在冷却或处理中，请稍后再核实',
    );
    expect(refundVoidErrorMessage(40923, '需复核')).toBe(
      '渠道结果仍不确定，需继续人工复核',
    );
    expect(refundVoidErrorMessage(50001, '服务器错误')).toBe('服务器错误');
  });
});
