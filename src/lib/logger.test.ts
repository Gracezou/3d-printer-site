import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { LOGGER_REDACT_PATHS } from '@/lib/logger';

describe('logger redaction', () => {
  it('redacts the real AlipayRequestError transport and response fields', () => {
    let output = '';
    const testLogger = pino(
      {
        redact: { paths: LOGGER_REDACT_PATHS, censor: '[REDACTED]' },
      },
      { write: (chunk: string) => (output += chunk) },
    );

    const requestError = Object.assign(new Error('支付宝请求失败'), {
      responseDataRaw:
        '{"buyer_logon_id":"buyer@example.com","sign":"secret-sign"}',
      responseHttpHeaders: {
        'set-cookie': 'session=secret-cookie',
      },
      traceId: 'sensitive-trace-id',
      links: { troubleshooting: 'https://example.com/private-request' },
    });
    testLogger.error({ err: requestError });

    expect(output).toContain('支付宝请求失败');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('buyer@example.com');
    expect(output).not.toContain('secret-sign');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('sensitive-trace-id');
    expect(output).not.toContain('private-request');
  });
});
