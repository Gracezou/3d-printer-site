import { describe, expect, it } from 'vitest';

import { BizError } from './errors';
import {
  consumeModelRequestRateLimit,
  resetModelRequestRateLimitForTests,
} from './model-request-rate-limit';

describe('consumeModelRequestRateLimit', () => {
  it('limits the eleventh request from one IP within an hour', () => {
    resetModelRequestRateLimitForTests();
    for (let index = 0; index < 10; index += 1) {
      consumeModelRequestRateLimit('203.0.113.10', index);
    }
    expect(() => consumeModelRequestRateLimit('203.0.113.10', 10)).toThrowError(
      BizError,
    );
  });

  it('does not share counters between IP addresses', () => {
    resetModelRequestRateLimitForTests();
    for (let index = 0; index < 10; index += 1) {
      consumeModelRequestRateLimit('203.0.113.10', index);
    }
    expect(() =>
      consumeModelRequestRateLimit('203.0.113.11', 10),
    ).not.toThrow();
  });

  it('expires attempts after one hour', () => {
    resetModelRequestRateLimitForTests();
    for (let index = 0; index < 10; index += 1) {
      consumeModelRequestRateLimit('203.0.113.10', index);
    }
    expect(() =>
      consumeModelRequestRateLimit('203.0.113.10', 60 * 60_000 + 1),
    ).not.toThrow();
  });
});
