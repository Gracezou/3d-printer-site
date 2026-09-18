import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  voidRefundAfterManualVerification: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock('@/lib/services/refund.service', () => ({
  voidRefundAfterManualVerification:
    mocks.voidRefundAfterManualVerification,
}));

import { POST } from './route';

describe('POST /api/admin/refunds/[id]/void', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires order:refund and forwards the mandatory conclusion', async () => {
    const admin = {
      sub: crypto.randomUUID(),
      username: 'refund-reviewer',
      name: '退款复核员',
      roleCode: 'ops',
      permissions: ['order:refund'],
    };
    const refundId = crypto.randomUUID();
    mocks.requirePermission.mockResolvedValue(admin);
    mocks.voidRefundAfterManualVerification.mockResolvedValue({
      id: refundId,
      status: 'failed',
      orderStatus: 'paid',
    });
    const response = await POST(
      new Request(`http://localhost/api/admin/refunds/${refundId}/void`, {
        method: 'POST',
        body: JSON.stringify({ conclusion: '支付宝商家中心确认未出款' }),
      }),
      { params: Promise.resolve({ id: refundId }) },
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith('order:refund');
    expect(mocks.voidRefundAfterManualVerification).toHaveBeenCalledWith(
      refundId,
      '支付宝商家中心确认未出款',
      { admin, ip: 'unknown' },
    );
    expect(response.status).toBe(200);
  });
});
