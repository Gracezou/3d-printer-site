import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  approveReturnRequest: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock('@/lib/services/return-request.service', () => ({
  approveReturnRequest: mocks.approveReturnRequest,
}));

import { POST } from './route';

const requestId = '11111111-1111-4111-8111-111111111111';
const orderItemId = '22222222-2222-4222-8222-222222222222';

function request() {
  return new Request(`http://localhost/api/admin/returns/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      items: [{ orderItemId, restock: false }],
    }),
  });
}

describe('POST /api/admin/returns/[id]/approve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a reviewer who lacks order:refund', async () => {
    mocks.requirePermission.mockResolvedValue({
      sub: crypto.randomUUID(),
      username: 'reviewer',
      name: '审核员',
      roleCode: 'operator',
      permissions: ['return:review'],
    });
    const response = await POST(request(), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith('return:review');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 40301 });
    expect(mocks.approveReturnRequest).not.toHaveBeenCalled();
  });

  it('allows approval only when both permissions are present', async () => {
    const admin = {
      sub: crypto.randomUUID(),
      username: 'refund-reviewer',
      name: '退款审核员',
      roleCode: 'admin',
      permissions: ['return:review', 'order:refund'],
    };
    mocks.requirePermission.mockResolvedValue(admin);
    mocks.approveReturnRequest.mockResolvedValue({ id: crypto.randomUUID() });
    const response = await POST(request(), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.approveReturnRequest).toHaveBeenCalledWith(
      requestId,
      { items: [{ orderItemId, restock: false }] },
      { admin, ip: 'unknown' },
    );
  });
});
