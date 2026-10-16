'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';

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
  brands: Array<{ name: string; models: Array<{ id: string; name: string }> }>;
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
  brands,
}: ProductFilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const models = brands.flatMap((brand) =>
    brand.models.map((model) => ({
      ...model,
      label: `${brand.name} ${model.name}`,
    })),
  );
  const conditions = [
    ['keyword', query.keyword],
    [
      'deviceModelId',
      models.find((model) => model.id === query.deviceModelId)?.label ??
        (query.deviceModelId ? '已选机型' : undefined),
    ],
    [
      'categoryId',
      categories.find((category) => category.id === query.categoryId)?.name,
    ],
    ['materialType', query.materialType],
    ['minPrice', query.minPrice ? `最低 ¥${query.minPrice}` : undefined],
    ['maxPrice', query.maxPrice ? `最高 ¥${query.maxPrice}` : undefined],
    [
      'sort',
      query.sort !== 'default'
        ? sortOptions.find(([value]) => value === query.sort)?.[1]
        : undefined,
    ],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  function navigate(params: URLSearchParams) {
    const search = params.toString();
    startTransition(() =>
      router.push(search ? `/products?${search}` : '/products', {
        scroll: false,
      }),
    );
  }

  function removeCondition(key: string) {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (
        name !== key &&
        name !== 'page' &&
        name !== 'pageSize' &&
        value &&
        !(name === 'sort' && value === 'default')
      )
        params.set(name, String(value));
    }
    navigate(params);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const min = formData.get('minPrice');
    const max = formData.get('maxPrice');
    if (min && max && Number(min) > Number(max)) {
      setError('最低价不能高于最高价');
      return;
    }
    setError('');
    const params = new URLSearchParams();
    for (const key of [
      'keyword',
      'categoryId',
      'deviceModelId',
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
    navigate(params);
  }

  return (
    <form
      key={JSON.stringify(query)}
      onSubmit={submit}
      aria-busy={isPending}
      className="rounded-[1.5rem] border border-stone-900/8 bg-white/65 p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4" /> 筛选与排序
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="product-filter-fields"
          onClick={() => setExpanded((value) => !value)}
          className="ml-auto px-3 text-sm underline sm:hidden"
        >
          {expanded
            ? '收起条件'
            : `展开条件${conditions.length ? `（${conditions.length}）` : ''}`}
        </button>
        {isPending ? (
          <span role="status" className="text-xs font-normal text-stone-600">
            正在更新…
          </span>
        ) : null}
      </div>
      <div
        id="product-filter-fields"
        className={`${expanded ? 'grid' : 'hidden sm:grid'} gap-3 md:grid-cols-2 lg:grid-cols-4`}
      >
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
          <span className="sr-only">适配机型</span>
          <select
            name="deviceModelId"
            defaultValue={query.deviceModelId ?? ''}
            className="h-11 w-full rounded-lg border border-stone-900/10 bg-white px-3 text-sm"
          >
            <option value="">全部机型</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
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
          <button
            type="button"
            disabled={isPending}
            onClick={() => navigate(new URLSearchParams())}
            className="inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold text-stone-500 transition hover:bg-stone-900/5"
          >
            清除
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-store-ink hover:bg-store-ink-hover inline-flex h-10 items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition disabled:opacity-60"
          >
            {isPending ? '更新中…' : '应用筛选'}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {conditions.length ? (
        <div
          aria-label="已应用的筛选条件"
          className="mt-3 flex flex-wrap gap-2 border-t border-stone-900/10 pt-3"
        >
          {conditions.map(([key, label]) => (
            <button
              type="button"
              key={key}
              disabled={isPending}
              onClick={() => removeCondition(key)}
              aria-label={`移除条件：${label}`}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-900/15 px-3 text-xs"
            >
              {label}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
