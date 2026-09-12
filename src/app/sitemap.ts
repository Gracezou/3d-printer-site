import type { MetadataRoute } from 'next';

import { absoluteSiteUrl } from '@/lib/seo';
import { getPublicDeviceCatalog } from '@/lib/services/device.service';
import {
  getSitemapStorefrontEntries,
  hasPostgresErrorCode,
} from '@/lib/services/storefront.service';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products, categories }, devices] = await Promise.all([
    getSitemapStorefrontEntries(),
    getPublicDeviceCatalog().catch((error: unknown) => {
      if (hasPostgresErrorCode(error, '42P01')) return [];
      throw error;
    }),
  ]);

  return [
    {
      url: absoluteSiteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteSiteUrl('/products'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...categories.map((category) => ({
      url: absoluteSiteUrl(`/category/${category.slug}`),
      lastModified: category.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: absoluteSiteUrl(`/products/${product.slug}`),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...devices.flatMap((brand) =>
      brand.models.map((model) => ({
        url: absoluteSiteUrl(`/devices/${brand.slug}/${model.slug}`),
        changeFrequency: 'monthly' as const,
        priority: model.isMolded ? 0.8 : 0.6,
      })),
    ),
  ];
}
