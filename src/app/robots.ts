import type { MetadataRoute } from 'next';

import { absoluteSiteUrl, getSiteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/account', '/checkout', '/api'],
    },
    sitemap: absoluteSiteUrl('/sitemap.xml'),
    host: getSiteOrigin(),
  };
}
