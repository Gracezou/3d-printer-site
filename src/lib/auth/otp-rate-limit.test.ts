import { afterEach, describe, expect, it } from 'vitest';

import { BizError } from '@/lib/errors';
import {
  consumeOtpRateLimit,
  resetOtpRateLimitsForTests,
} from '@/lib/auth/otp-rate-limit';

afterEach(resetOtpRateLimitsForTests);

describe('OTP rate limiter', () => {
  it('rejects a repeated email address within 60 seconds', () => {
    consumeOtpRateLimit('user@example.test', '127.0.0.1', 1_000);
    expect(() =>
      consumeOtpRateLimit('USER@example.test', '127.0.0.2', 60_999),
    ).toThrow(BizError);
    expect(() =>
      consumeOtpRateLimit('user@example.test', '127.0.0.2', 61_000),
    ).not.toThrow();
  });

  it('rejects more than 10 requests from one IP per hour', () => {
    for (let index = 0; index < 10; index += 1) {
      consumeOtpRateLimit(`user-${index}@example.test`, '127.0.0.1', index);
    }

    expect(() =>
      consumeOtpRateLimit('overflow@example.test', '127.0.0.1', 10),
    ).toThrow(BizError);
    expect(() =>
      consumeOtpRateLimit('overflow@example.test', '127.0.0.1', 3_600_000),
    ).not.toThrow();
  });
});
