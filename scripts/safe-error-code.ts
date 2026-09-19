// Error messages from database clients may contain hosts, usernames or
// connection strings. Only return a bounded symbolic code suitable for logs.
export function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (/^[A-Z0-9_]{2,40}$/u.test(code)) return code;
  }
  return error instanceof Error ? error.constructor.name : 'unknown';
}
