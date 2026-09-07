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

export function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  if (phone.length < 7) {
    return '****';
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function maskEmail(email: string | null): string {
  if (!email) return '—';
  const separator = email.lastIndexOf('@');
  if (separator <= 0) return '***';
  const local = email.slice(0, separator);
  const domain = email.slice(separator);
  return `${local.slice(0, Math.min(2, local.length))}***${domain}`;
}

export function createRequestLogger(requestId: string): pino.Logger {
  return logger.child({ requestId });
}
