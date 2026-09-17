import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { LOGGER_REDACT_PATHS } from '@/lib/logger';

describe('logger redaction', () => {
  it('redacts nested SDK request, signature, and params fields from err', () => {
    let output = '';
    const testLogger = pino(
      {
        redact: { paths: LOGGER_REDACT_PATHS, censor: '[REDACTED]' },
      },
      { write: (chunk: string) => (output += chunk) },
    );

    testLogger.error({
      err: {
        message: '支付宝请求失败',
        params: { bizContent: 'sensitive params' },
        signature: 'sensitive signature',
        response: {
          request: 'raw request',
          config: { headers: { Authorization: 'secret' } },
          data: { sign: 'response signature', code: '20000' },
        },
      },
    });

    expect(output).toContain('支付宝请求失败');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('sensitive params');
    expect(output).not.toContain('sensitive signature');
    expect(output).not.toContain('raw request');
    expect(output).not.toContain('Authorization');
    expect(output).not.toContain('response signature');
  });
});
