'use client';

import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useTransition } from 'react';

import type {
  StorefrontProductListQuery,
  StorefrontMaterialType,
} from '@/lib/validators/storefront';

interface CategoryOption {
  id: string;
  parentId: string | null;
  name: string;
}

interface ProductFilterFormProps {
  categories: CategoryOption[];
  query: StorefrontProductListQuery;
}

const materialOptions: Array<[StorefrontMaterialType, string]> = [
  ['PLA', 'PLA'],
  ['PETG', 'PETG'],
  ['ABS', 'ABS'],
  ['TPU', 'TPU'],
  ['ASA', 'ASA'],
  ['PA', '尼龙'],
  ['RESIN', '树脂'],
  ['OTHER', '其他'],
];

const sortOptions = [
  ['default', '综合排序'],
  ['price_asc', '价格从低到高'],
  ['price_desc', '价格从高到低'],
  ['newest', '最新上架'],
] as const;

export function ProductFilterForm({
  categories,
  query,
}: ProductFilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of [
      'keyword',
      'categoryId',
      'materialType',
      'minPrice',
      'maxPrice',
      'sort',
    ]) {
      const value = formData.get(key);
      if (typeof value === 'string' && value.trim()) {
        if (key !== 'sort' || value !== 'default')
          params.set(key, value.trim());
      }
    }
    const search = params.toString();
    startTransition(() =>
      router.replace(search ? `/products?${search}` : '/products'),
    );
  }

  return (
    <form
      key={JSON.stringify(query)}
      onSubmit={submit}
      aria-busy={isPending}
      className="rounded-[1.5rem] border border-stone-900/8 bg-white/65 p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4" /> 筛选与排序
        {isPending ? (
          <span className="ml-auto text-xs font-normal text-stone-400">
            正在更新…
          </span>
        ) : null}
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
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#17251c] px-6 text-sm font-semibold text-white transition hover:bg-[#294131] disabled:opacity-60"
          >
            {isPending ? '更新中…' : '应用筛选'}
          </button>
        </div>
      </div>
    </form>
  );
}
