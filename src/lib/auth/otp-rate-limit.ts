import { createHash } from 'node:crypto';

import { BizError } from '@/lib/errors';

const PHONE_WINDOW_MS = 60_000;
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX_REQUESTS = 10;

const phoneAttempts = new Map<string, number>();
const ipAttempts = new Map<string, number[]>();

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function consumeOtpRateLimit(
  phone: string,
  ip: string,
  now = Date.now(),
): void {
  const phoneKey = hash(phone);
  const previousPhoneAttempt = phoneAttempts.get(phoneKey);
  if (
    previousPhoneAttempt !== undefined &&
    now - previousPhoneAttempt < PHONE_WINDOW_MS
  ) {
    throw new BizError('OTP_RATE_LIMIT', '验证码发送过于频繁，请稍后再试');
  }

  const ipKey = hash(ip);
  const recentIpAttempts = (ipAttempts.get(ipKey) ?? []).filter(
    (attemptedAt) => now - attemptedAt < IP_WINDOW_MS,
  );
  if (recentIpAttempts.length >= IP_MAX_REQUESTS) {
    ipAttempts.set(ipKey, recentIpAttempts);
    throw new BizError('OTP_RATE_LIMIT', '验证码发送过于频繁，请稍后再试');
  }

  phoneAttempts.set(phoneKey, now);
  ipAttempts.set(ipKey, [...recentIpAttempts, now]);
}

export function resetOtpRateLimitsForTests(): void {
  phoneAttempts.clear();
  ipAttempts.clear();
}
