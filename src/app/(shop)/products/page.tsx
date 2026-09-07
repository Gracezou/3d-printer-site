import type { Metadata } from 'next';

import { ProductListing } from '@/components/shop/product-listing';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '全部作品',
  description: '浏览全部在售 3D 打印作品，按分类、价格与打印材质筛选。',
  alternates: { canonical: '/products' },
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
      eyebrow="全部作品"
      title="全部作品"
      description="从桌面摆件到实用家居，每一件作品都按需打印、逐件检查后发出。"
      query={query}
    />
  );
}
