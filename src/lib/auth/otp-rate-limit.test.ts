import { afterEach, describe, expect, it } from 'vitest';

import { BizError } from '@/lib/errors';
import {
  consumeOtpRateLimit,
  resetOtpRateLimitsForTests,
} from '@/lib/auth/otp-rate-limit';

afterEach(resetOtpRateLimitsForTests);

describe('OTP rate limiter', () => {
  it('rejects a repeated phone number within 60 seconds', () => {
    consumeOtpRateLimit('13800138000', '127.0.0.1', 1_000);
    expect(() =>
      consumeOtpRateLimit('13800138000', '127.0.0.2', 60_999),
    ).toThrow(BizError);
    expect(() =>
      consumeOtpRateLimit('13800138000', '127.0.0.2', 61_000),
    ).not.toThrow();
  });

  it('rejects more than 10 requests from one IP per hour', () => {
    for (let index = 0; index < 10; index += 1) {
      consumeOtpRateLimit(
        `13800138${index.toString().padStart(3, '0')}`,
        '127.0.0.1',
        index,
      );
    }

    expect(() => consumeOtpRateLimit('13900139000', '127.0.0.1', 10)).toThrow(
      BizError,
    );
    expect(() =>
      consumeOtpRateLimit('13900139000', '127.0.0.1', 3_600_000),
    ).not.toThrow();
  });
});
