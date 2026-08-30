import { timingSafeEqual } from 'node:crypto';

import { BizError } from '@/lib/errors';

function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function requireCronAuthorization(request: Request): void {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  const suppliedSecret = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (
    !configuredSecret ||
    !suppliedSecret ||
    !secretsEqual(suppliedSecret, configuredSecret)
  ) {
    throw new BizError('UNAUTHORIZED', '定时任务鉴权失败');
  }
}
