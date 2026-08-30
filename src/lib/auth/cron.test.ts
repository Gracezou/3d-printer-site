import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireCronAuthorization } from '@/lib/auth/cron';
import { BizError } from '@/lib/errors';

describe('requireCronAuthorization', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts the configured bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret-at-least-32-chars');
    expect(() =>
      requireCronAuthorization(
        new Request('http://localhost/api/cron/test', {
          headers: {
            authorization: 'Bearer test-cron-secret-at-least-32-chars',
          },
        }),
      ),
    ).not.toThrow();
  });

  it.each([undefined, '', 'Bearer wrong-secret'])(
    'rejects an invalid authorization header',
    (authorization) => {
      vi.stubEnv('CRON_SECRET', 'test-cron-secret-at-least-32-chars');
      const headers = authorization ? { authorization } : undefined;
      expect(() =>
        requireCronAuthorization(
          new Request('http://localhost/api/cron/test', { headers }),
        ),
      ).toThrowError(BizError);
    },
  );
});
