import type { Metadata } from 'next';

import { ProductListing } from '@/components/shop/product-listing';
import { absoluteSiteUrl } from '@/lib/seo';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';
import { zhCN } from '@/messages/zh-CN';

export const revalidate = 60;

export const metadata: Metadata = {
  title: zhCN.seo.productListTitle,
  description: zhCN.seo.productListDescription,
  alternates: { canonical: absoluteSiteUrl('/products') },
  openGraph: {
    type: 'website',
    url: absoluteSiteUrl('/products'),
    title: `${zhCN.seo.productListTitle}｜${zhCN.brand.name}`,
    description: zhCN.seo.productListDescription,
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
      eyebrow={zhCN.navigation.allDevices}
      title={zhCN.seo.productListTitle}
      description="按设备寻找合身的保护壳。每一件都按单打印，并在装机复核后发出。"
      query={query}
    />
  );
}
