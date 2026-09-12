const LOCAL_SITE_ORIGIN = 'http://localhost:5003';

export function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    return new URL(configured || LOCAL_SITE_ORIGIN).origin;
  } catch {
    return LOCAL_SITE_ORIGIN;
  }
}

export function absoluteSiteUrl(path = '/'): string {
  return new URL(path, `${getSiteOrigin()}/`).toString();
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
