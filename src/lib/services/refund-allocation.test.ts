import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  allocateRefund,
  type RefundAllocationInput,
} from './refund-allocation';

const order: Omit<RefundAllocationInput, 'requests'> = {
  itemsAmount: '49.97',
  discountAmount: '7.33',
  shippingAmount: '6.80',
  paidAmount: '49.44',
  items: [
    { orderItemId: 'c', subtotal: '29.99', quantity: 1, refundedQuantity: 0 },
    { orderItemId: 'a', subtotal: '9.99', quantity: 3, refundedQuantity: 0 },
    { orderItemId: 'b', subtotal: '9.99', quantity: 1, refundedQuantity: 0 },
  ],
};

describe('allocateRefund', () => {
  it('returns the exact paid amount after three item-level refunds', () => {
    const first = allocateRefund({
      ...order,
      requests: [{ orderItemId: 'c', quantity: 1 }],
    });
    expect(first.isFullRefund).toBe(false);
    expect(first.lines[0]?.shippingShare).toBe('0.00');

    const second = allocateRefund({
      ...order,
      items: order.items.map((item) =>
        item.orderItemId === 'c' ? { ...item, refundedQuantity: 1 } : item,
      ),
      requests: [{ orderItemId: 'b', quantity: 1 }],
    });
    expect(second.isFullRefund).toBe(false);

    const final = allocateRefund({
      ...order,
      items: order.items.map((item) =>
        item.orderItemId === 'a' ? item : { ...item, refundedQuantity: 1 },
      ),
      requests: [{ orderItemId: 'a', quantity: 3 }],
    });
    expect(final.isFullRefund).toBe(true);
    expect(final.lines[0]?.shippingShare).toBe('6.80');
    expect(
      [first.amount, second.amount, final.amount]
        .reduce((sum, amount) => sum.plus(amount), new Decimal(0))
        .toFixed(2),
    ).toBe('49.44');
  });

  it('splits the same item into cent-exact partial quantities', () => {
    const amounts: string[] = [];
    for (let refundedQuantity = 0; refundedQuantity < 3; refundedQuantity++) {
      const result = allocateRefund({
        ...order,
        items: order.items.map((item) =>
          item.orderItemId === 'a' ? { ...item, refundedQuantity } : item,
        ),
        requests: [{ orderItemId: 'a', quantity: 1 }],
      });
      amounts.push(result.amount);
      expect(result.lines[0]?.shippingShare).toBe('0.00');
    }
    expect(amounts).toHaveLength(3);
    expect(amounts[0]).not.toBe('0.00');
  });

  it('puts shipping only on the final refunded unit', () => {
    const result = allocateRefund({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        refundedQuantity: item.quantity - 1,
      })),
      requests: order.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: 1,
      })),
    });
    expect(result.isFullRefund).toBe(true);
    expect(
      result.lines.filter((line) => line.shippingShare !== '0.00'),
    ).toHaveLength(1);
  });

  it('does not invent shipping on a free-shipping order', () => {
    const result = allocateRefund({
      ...order,
      shippingAmount: '0.00',
      paidAmount: '42.64',
      requests: [{ orderItemId: 'c', quantity: 1 }],
    });
    expect(result.isFullRefund).toBe(false);
    expect(result.lines[0]?.shippingShare).toBe('0.00');
    expect(new Decimal(result.amount).gt(0)).toBe(true);
  });

  it('rejects over-refunding and inconsistent order totals', () => {
    expect(() =>
      allocateRefund({
        ...order,
        requests: [{ orderItemId: 'a', quantity: 4 }],
      }),
    ).toThrow('退款数量超过商品可退数量');
    expect(() =>
      allocateRefund({
        ...order,
        paidAmount: '49.45',
        requests: [{ orderItemId: 'a', quantity: 1 }],
      }),
    ).toThrow('订单金额不一致');
  });

  it('allocates a near-total discount without making a line negative', () => {
    const tinyItems = Array.from({ length: 100 }, (_, index) => ({
      orderItemId: String(index).padStart(3, '0'),
      subtotal: '0.01',
      quantity: 1,
      refundedQuantity: 0,
    }));
    const result = allocateRefund({
      itemsAmount: '1.00',
      discountAmount: '0.99',
      shippingAmount: '0.00',
      paidAmount: '0.01',
      items: tinyItems,
      requests: tinyItems.map(({ orderItemId }) => ({
        orderItemId,
        quantity: 1,
      })),
    });
    expect(result.amount).toBe('0.01');
    expect(result.lines.every((line) => new Decimal(line.amount).gte(0))).toBe(
      true,
    );
  });
});
