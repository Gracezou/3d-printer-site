export function shouldUseSecureSessionCookie(
  nodeEnvironment = process.env.NODE_ENV,
  configured = process.env.SESSION_COOKIE_SECURE,
): boolean {
  const normalized = configured?.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return nodeEnvironment === 'production';
}
