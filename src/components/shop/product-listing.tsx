import {
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';

import { ProductCard } from '@/components/shop/product-card';
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

const materialOptions = [
  ['PLA', 'PLA'],
  ['PETG', 'PETG'],
  ['ABS', 'ABS'],
  ['TPU', 'TPU'],
  ['ASA', 'ASA'],
  ['PA', '尼龙'],
  ['RESIN', '树脂'],
  ['OTHER', '其他'],
] as const;

const sortOptions = [
  ['default', '综合排序'],
  ['price_asc', '价格从低到高'],
  ['price_desc', '价格从高到低'],
  ['newest', '最新上架'],
] as const;

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
        <form
          action="/products"
          className="rounded-[1.5rem] border border-stone-900/8 bg-white/65 p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" /> 筛选与排序
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className="sr-only">搜索作品</span>
              <input
                type="search"
                name="keyword"
                defaultValue={query.keyword}
                placeholder="搜索作品名称"
                className="h-11 w-full rounded-xl border border-stone-900/10 bg-white px-4 text-sm outline-none focus:border-stone-900/30"
              />
            </label>
            <label>
              <span className="sr-only">商品分类</span>
              <select
                name="categoryId"
                defaultValue={query.categoryId ?? ''}
                className="h-11 w-full rounded-xl border border-stone-900/10 bg-white px-3 text-sm outline-none focus:border-stone-900/30"
              >
                <option value="">全部分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parentId ? `　${category.name}` : category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">打印材质</span>
              <select
                name="materialType"
                defaultValue={query.materialType ?? ''}
                className="h-11 w-full rounded-xl border border-stone-900/10 bg-white px-3 text-sm outline-none focus:border-stone-900/30"
              >
                <option value="">全部材质</option>
                {materialOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">最低价格</span>
              <input
                type="number"
                name="minPrice"
                min="0"
                step="0.01"
                defaultValue={query.minPrice}
                placeholder="最低价"
                className="h-11 w-full rounded-xl border border-stone-900/10 bg-white px-3 text-sm outline-none focus:border-stone-900/30"
              />
            </label>
            <label>
              <span className="sr-only">最高价格</span>
              <input
                type="number"
                name="maxPrice"
                min="0"
                step="0.01"
                defaultValue={query.maxPrice}
                placeholder="最高价"
                className="h-11 w-full rounded-xl border border-stone-900/10 bg-white px-3 text-sm outline-none focus:border-stone-900/30"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-stone-500">
              排序
              <select
                name="sort"
                defaultValue={query.sort}
                className="h-10 rounded-xl border border-stone-900/10 bg-white px-3 text-sm text-stone-800 outline-none"
              >
                {sortOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Link
                href="/products"
                className="inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold text-stone-500 transition hover:bg-stone-900/5"
              >
                清除
              </Link>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#17251c] px-6 text-sm font-semibold text-white transition hover:bg-[#294131]"
              >
                应用筛选
              </button>
            </div>
          </div>
        </form>

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
