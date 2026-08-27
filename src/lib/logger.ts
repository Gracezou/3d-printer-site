import pino from 'pino';

export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'password',
      '*.password',
      'privateKey',
      '*.privateKey',
      'serviceRoleKey',
      '*.serviceRoleKey',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ALIPAY_PRIVATE_KEY',
    ],
    censor: '[REDACTED]',
  },
});

export function maskPhone(phone: string): string {
  if (phone.length < 7) {
    return '****';
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function createRequestLogger(requestId: string): pino.Logger {
  return logger.child({ requestId });
}
