import { createHash } from 'node:crypto';

import { BizError } from '@/lib/errors';

const WINDOW_MS = 60 * 60_000;
const MAX_REQUESTS_PER_IP = 10;
const attemptsByIp = new Map<string, number[]>();

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export function consumeModelRequestRateLimit(
  ip: string,
  now = Date.now(),
): void {
  const key = hashIp(ip);
  const recent = (attemptsByIp.get(key) ?? []).filter(
    (attemptedAt) => now - attemptedAt < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS_PER_IP) {
    attemptsByIp.set(key, recent);
    throw new BizError(
      'MODEL_REQUEST_RATE_LIMITED',
      '登记过于频繁，请稍后再试',
    );
  }
  attemptsByIp.set(key, [...recent, now]);
}

export function resetModelRequestRateLimitForTests(): void {
  attemptsByIp.clear();
}
