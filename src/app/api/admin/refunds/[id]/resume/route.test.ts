import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resumeRefund: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock('@/lib/services/refund.service', () => ({
  resumeRefund: mocks.resumeRefund,
}));

import { POST } from './route';

describe('POST /api/admin/refunds/[id]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires order:refund and resumes by the persisted refund id', async () => {
    const admin = {
      sub: '6aaec56b-1e70-42dd-8a21-b29460c8c245',
      username: 'refund-admin',
      name: '退款管理员',
      roleCode: 'ops',
      permissions: ['order:refund'],
    };
    const refundId = '7f9d7ce8-3a0b-469b-ac45-2eb33f0d2109';
    mocks.requirePermission.mockResolvedValue(admin);
    mocks.resumeRefund.mockResolvedValue({ id: refundId, status: 'success' });

    const response = await POST(
      new Request(`http://localhost/api/admin/refunds/${refundId}/resume`, {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
      }),
      { params: Promise.resolve({ id: refundId }) },
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith('order:refund');
    expect(mocks.resumeRefund).toHaveBeenCalledWith(refundId, {
      admin,
      ip: '127.0.0.1',
    });
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { id: refundId, status: 'success' },
    });
  });
});
