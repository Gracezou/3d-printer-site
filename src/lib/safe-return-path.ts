export function safeReturnPath(
  value: string | undefined,
  fallback = '/account/orders',
): string {
  if (
    !value?.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, 'https://shop.invalid');
    return url.origin === 'https://shop.invalid'
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
