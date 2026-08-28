import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductListing } from '@/components/shop/product-listing';
import { getStorefrontCategoryBySlug } from '@/lib/services/storefront.service';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';

export const revalidate = 60;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getStorefrontCategoryBySlug(slug);
  if (!category) return { title: '分类不存在' };
  return {
    title: category.name,
    description: `浏览${category.name}分类下的 3D 打印作品。`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ slug }, rawParams] = await Promise.all([params, searchParams]);
  const category = await getStorefrontCategoryBySlug(slug);
  if (!category) notFound();

  const filteredParams = Object.fromEntries(
    Object.entries(rawParams).flatMap(([key, value]) =>
      typeof value === 'string' && key !== 'categoryId' ? [[key, value]] : [],
    ),
  );
  const parsed = storefrontProductListQuerySchema.safeParse({
    ...filteredParams,
    categoryId: category.id,
    pageSize: 24,
  });
  const query = parsed.success
    ? parsed.data
    : storefrontProductListQuerySchema.parse({
        categoryId: category.id,
        pageSize: 24,
      });

  return (
    <ProductListing
      eyebrow="CATEGORY"
      title={category.name}
      description={`浏览 ${category.name} 分类下的全部在售作品。`}
      query={query}
    />
  );
}
