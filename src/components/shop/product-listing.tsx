import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react';
import Link from 'next/link';

import { ProductCard } from '@/components/shop/product-card';
import { ProductFilterForm } from '@/components/shop/product-filter-form';
import {
  getStorefrontCategories,
  listStorefrontProducts,
} from '@/lib/services/storefront.service';
import type { StorefrontProductListQuery } from '@/lib/validators/storefront';

interface ProductListingProps {
  eyebrow: string;
  title: string;
  description: string;
  query: StorefrontProductListQuery;
}

function pageHref(query: StorefrontProductListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.minPrice) params.set('minPrice', query.minPrice);
  if (query.maxPrice) params.set('maxPrice', query.maxPrice);
  if (query.materialType) params.set('materialType', query.materialType);
  if (query.sort !== 'default') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return search ? `/products?${search}` : '/products';
}

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export async function ProductListing({
  eyebrow,
  title,
  description,
  query,
}: ProductListingProps) {
  const [result, categories] = await Promise.all([
    listStorefrontProducts(query),
    getStorefrontCategories(),
  ]);

  return (
    <main>
      <section className="border-b border-stone-900/8 bg-[#e8ecdf]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-xs font-bold tracking-[0.22em] text-[#59705f]">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
            {description}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <ProductFilterForm categories={categories} query={query} />

        <div className="mt-10 flex items-center justify-between gap-4">
          <p className="text-sm text-stone-500">
            找到{' '}
            <span className="font-semibold text-stone-900">{result.total}</span>{' '}
            件作品
          </p>
          {result.pageCount > 0 ? (
            <p className="text-xs text-stone-400">
              第 {result.page} / {result.pageCount} 页
            </p>
          ) : null}
        </div>

        {result.list.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {result.list.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-6 flex min-h-80 flex-col items-center justify-center rounded-[2rem] border border-dashed border-stone-900/15 bg-white/40 px-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-stone-900/5">
              <PackageSearch className="size-6 text-stone-400" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">
              没有找到符合条件的作品
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              试试放宽价格范围或更换分类与材质。
            </p>
            <Link
              href="/products"
              className="mt-6 text-sm font-semibold underline underline-offset-4"
            >
              查看全部作品
            </Link>
          </div>
        )}

        {result.pageCount > 1 ? (
          <nav
            aria-label="商品分页"
            className="mt-14 flex items-center justify-center gap-2"
          >
            {result.page > 1 ? (
              <Link
                href={pageHref(query, result.page - 1)}
                aria-label="上一页"
                className="grid size-10 place-items-center rounded-full border border-stone-900/10 bg-white"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : null}
            {getPageNumbers(result.page, result.pageCount).map((page) => (
              <Link
                key={page}
                href={pageHref(query, page)}
                aria-current={page === result.page ? 'page' : undefined}
                className={`grid size-10 place-items-center rounded-full text-sm font-semibold ${page === result.page ? 'bg-[#17251c] text-white' : 'border border-stone-900/10 bg-white'}`}
              >
                {page}
              </Link>
            ))}
            {result.page < result.pageCount ? (
              <Link
                href={pageHref(query, result.page + 1)}
                aria-label="下一页"
                className="grid size-10 place-items-center rounded-full border border-stone-900/10 bg-white"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
