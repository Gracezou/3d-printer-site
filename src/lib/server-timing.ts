import { logger } from '@/lib/logger';

export function finishServerTiming(
  response: Response,
  metric: string,
  startedAt: number,
): Response {
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  response.headers.set('Server-Timing', `${metric};dur=${durationMs}`);
  if (durationMs >= 500) {
    logger.warn({ metric, durationMs }, 'Slow API request');
  }
  return response;
}
