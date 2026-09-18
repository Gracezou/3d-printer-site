import { describe, expect, it } from 'vitest';

import { approveReturnRequest } from './return-request.service';

describe('approveReturnRequest permissions', () => {
  it('requires order:refund at the service boundary', async () => {
    await expect(
      approveReturnRequest(
        crypto.randomUUID(),
        { items: [{ orderItemId: crypto.randomUUID(), restock: false }] },
        {
          admin: {
            sub: crypto.randomUUID(),
            username: 'reviewer',
            name: '审核员',
            roleCode: 'reviewer',
            permissions: ['return:review'],
          },
          ip: '127.0.0.1',
        },
      ),
    ).rejects.toMatchObject({ code: 40301 });
  });

  it('requires return:review at the service boundary', async () => {
    await expect(
      approveReturnRequest(
        crypto.randomUUID(),
        { items: [{ orderItemId: crypto.randomUUID(), restock: false }] },
        {
          admin: {
            sub: crypto.randomUUID(),
            username: 'refunder',
            name: '退款员',
            roleCode: 'refunder',
            permissions: ['order:refund'],
          },
          ip: '127.0.0.1',
        },
      ),
    ).rejects.toMatchObject({ code: 40301 });
  });
});
