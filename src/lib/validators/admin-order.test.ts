import { describe, expect, it } from 'vitest';

import { adminOrderRefundSchema } from './admin-order';

const orderItemId = '11111111-1111-4111-8111-111111111111';

describe('adminOrderRefundSchema', () => {
  it('accepts item quantity and per-item restock without a client amount', () => {
    expect(
      adminOrderRefundSchema.parse({
        idempotencyKey: 'refund:request:001',
        reason: '商品损坏',
        items: [{ orderItemId, quantity: 1, restock: true }],
      }),
    ).toEqual({
      idempotencyKey: 'refund:request:001',
      reason: '商品损坏',
      items: [{ orderItemId, quantity: 1, restock: true }],
    });
  });

  it('rejects the legacy arbitrary amount payload', () => {
    expect(() =>
      adminOrderRefundSchema.parse({
        amount: '999.99',
        reason: '客户指定金额',
        restock: true,
      }),
    ).toThrow();
  });

  it('rejects duplicate order items in one refund', () => {
    expect(() =>
      adminOrderRefundSchema.parse({
        idempotencyKey: 'refund:request:002',
        reason: '重复商品',
        items: [
          { orderItemId, quantity: 1, restock: false },
          { orderItemId, quantity: 1, restock: true },
        ],
      }),
    ).toThrow('退款商品不能重复');
  });

  it('reserves the return: idempotency prefix for reviewed applications', () => {
    expect(() =>
      adminOrderRefundSchema.parse({
        idempotencyKey: 'return:11111111-1111-4111-8111-111111111111',
        reason: '后台直接退款不得占用售后审核键',
        items: [{ orderItemId, quantity: 1, restock: false }],
      }),
    ).toThrow('return: 前缀仅供售后审核流程使用');
  });
});
