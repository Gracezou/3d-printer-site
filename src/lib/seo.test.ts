import { afterEach, describe, expect, it } from 'vitest';

import { absoluteSiteUrl, getSiteOrigin, serializeJsonLd } from './seo';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe('site URL helpers', () => {
  it('builds absolute URLs from the configured public origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://printer.example.com/base/';
    expect(getSiteOrigin()).toBe('https://printer.example.com');
    expect(absoluteSiteUrl('/products/case')).toBe(
      'https://printer.example.com/products/case',
    );
  });
});

describe('serializeJsonLd', () => {
  it('escapes markup-capable product text', () => {
    const output = serializeJsonLd({
      name: '</script><script>alert(1)</script>',
    });
    expect(output).not.toContain('<');
    expect(output).toContain('\\u003c/script>');
  });
});
