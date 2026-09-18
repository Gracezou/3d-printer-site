import { afterEach, describe, expect, it } from 'vitest';

import { BizError } from '@/lib/errors';

import {
  consumeReturnEvidenceUploadRateLimit,
  resetReturnEvidenceUploadRateLimitForTests,
  RETURN_EVIDENCE_UPLOAD_LIMIT,
  RETURN_EVIDENCE_UPLOAD_WINDOW_MS,
} from './return-evidence-rate-limit';

afterEach(resetReturnEvidenceUploadRateLimitForTests);

describe('return evidence upload rate limiter', () => {
  it('limits each user to 20 uploads per hour', () => {
    for (let index = 0; index < RETURN_EVIDENCE_UPLOAD_LIMIT; index += 1) {
      consumeReturnEvidenceUploadRateLimit('user-a', index);
    }
    expect(() =>
      consumeReturnEvidenceUploadRateLimit('user-a', 1_000),
    ).toThrowError(BizError);
    expect(() =>
      consumeReturnEvidenceUploadRateLimit('user-b', 1_000),
    ).not.toThrow();
  });

  it('allows uploads after the rolling window expires', () => {
    for (let index = 0; index < RETURN_EVIDENCE_UPLOAD_LIMIT; index += 1) {
      consumeReturnEvidenceUploadRateLimit('user-a', index);
    }
    expect(() =>
      consumeReturnEvidenceUploadRateLimit(
        'user-a',
        RETURN_EVIDENCE_UPLOAD_WINDOW_MS + RETURN_EVIDENCE_UPLOAD_LIMIT,
      ),
    ).not.toThrow();
  });
});
