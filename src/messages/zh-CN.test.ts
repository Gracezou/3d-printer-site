import { describe, expect, it } from 'vitest';

import {
  customerOrderStatusLabels,
  orderStatusLabels,
  printStatusLabels,
  zhCN,
} from './zh-CN';

describe('zh-CN shared copy', () => {
  it('keeps the approved brand and delivery promises', () => {
    expect(zhCN.brand.name).toBe('书衣');
    expect(zhCN.brand.heroTitle).toBe('量卷裁衣');
    expect(zhCN.commerce.deliveryExpected).toContain('7 个自然日内发出');
  });

  it('provides shared transaction status labels', () => {
    expect(orderStatusLabels.refunded).toBe('已退款');
    expect(customerOrderStatusLabels.shipped).toBe('待收货');
    expect(printStatusLabels.post_processing).toBe('后处理中');
  });
});
