import { describe, expect, it } from 'vitest';

import { assertPermission, hasPermission } from '@/lib/auth/permissions';
import { BizError } from '@/lib/errors';

describe('admin permissions', () => {
  it('treats the wildcard as all permissions', () => {
    expect(hasPermission(['*'], 'order:refund')).toBe(true);
  });

  it('rejects a missing permission with FORBIDDEN', () => {
    try {
      assertPermission(['order:view'], 'order:refund');
      expect.fail('permission check should throw');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BizError);
      expect((error as BizError).code).toBe(40301);
      expect((error as BizError).httpStatus).toBe(403);
    }
  });
});
