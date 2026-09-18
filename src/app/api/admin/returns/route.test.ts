import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BizError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listAdminReturnRequests: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock('@/lib/services/return-request.service', () => ({
  listAdminReturnRequests: mocks.listAdminReturnRequests,
}));

import { GET } from './route';

describe('GET /api/admin/returns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires return:review before listing applications', async () => {
    mocks.requirePermission.mockResolvedValue({ sub: crypto.randomUUID() });
    mocks.listAdminReturnRequests.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    const response = await GET(
      new Request('http://localhost/api/admin/returns?status=pending'),
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith('return:review');
    expect(response.status).toBe(200);
  });

  it('returns 403 when the admin lacks return:review', async () => {
    mocks.requirePermission.mockRejectedValue(
      new BizError('FORBIDDEN', '无该操作权限'),
    );
    const response = await GET(new Request('http://localhost/api/admin/returns'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 40301 });
    expect(mocks.listAdminReturnRequests).not.toHaveBeenCalled();
  });
});
