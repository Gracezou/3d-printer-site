import { createHash } from 'node:crypto';

import { BizError } from '@/lib/errors';

export const RETURN_EVIDENCE_UPLOAD_WINDOW_MS = 60 * 60_000;
export const RETURN_EVIDENCE_UPLOAD_LIMIT = 20;

const attemptsByUser = new Map<string, number[]>();

function userKey(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

export function consumeReturnEvidenceUploadRateLimit(
  userId: string,
  now = Date.now(),
): void {
  const key = userKey(userId);
  const recent = (attemptsByUser.get(key) ?? []).filter(
    (attemptedAt) => now - attemptedAt < RETURN_EVIDENCE_UPLOAD_WINDOW_MS,
  );
  if (recent.length >= RETURN_EVIDENCE_UPLOAD_LIMIT) {
    attemptsByUser.set(key, recent);
    throw new BizError(
      'RETURN_EVIDENCE_RATE_LIMITED',
      '凭证上传过于频繁，请稍后再试',
    );
  }
  attemptsByUser.set(key, [...recent, now]);
}

export function resetReturnEvidenceUploadRateLimitForTests(): void {
  attemptsByUser.clear();
}
