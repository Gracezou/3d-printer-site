import type { Metadata } from 'next';

import { ProductListing } from '@/components/shop/product-listing';
import { absoluteSiteUrl } from '@/lib/seo';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';

export const revalidate = 60;

const PRODUCTS_DESCRIPTION =
  '浏览书衣为 Kindle、文石、掌阅、阅星瞳等电子阅读器制作的 3D 打印保护壳，支持冷门及停产机型按需开模。';

export const metadata: Metadata = {
  title: '电子阅读器保护壳',
  description: PRODUCTS_DESCRIPTION,
  alternates: { canonical: absoluteSiteUrl('/products') },
  openGraph: {
    type: 'website',
    url: absoluteSiteUrl('/products'),
    title: '电子阅读器保护壳｜书衣',
    description: PRODUCTS_DESCRIPTION,
  },
};

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const rawParams = await searchParams;
  const parsed = storefrontProductListQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(rawParams).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    ),
  );
  const query = parsed.success
    ? { ...parsed.data, pageSize: 24 }
    : storefrontProductListQuerySchema.parse({ pageSize: 24 });

  return (
    <ProductListing
      eyebrow="全部机型"
      title="电子阅读器保护壳"
      description="按设备寻找合身的保护壳。每一件都按单打印，并在装机复核后发出。"
      query={query}
    />
  );
}
