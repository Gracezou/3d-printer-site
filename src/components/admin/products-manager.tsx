'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  ImageIcon,
  LoaderCircle,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

interface ProductListItem {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  slug: string;
  subtitle: string | null;
  mainImageUrl: string | null;
  status: 'draft' | 'on_sale' | 'off_shelf';
  isFeatured: boolean;
  sortOrder: number;
  minPrice: string | null;
  maxPrice: string | null;
  variantCount: number;
  activeVariantCount: number;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CategoryNode {
  id: string;
  name: string;
  children: CategoryNode[];
}

interface ListResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const statusLabels = {
  draft: '草稿',
  on_sale: '在售',
  off_shelf: '已下架',
} as const;

const statusClasses = {
  draft: 'bg-amber-50 text-amber-700',
  on_sale: 'bg-emerald-50 text-emerald-700',
  off_shelf: 'bg-neutral-100 text-neutral-500',
} as const;

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.data === null) {
    if (response.status === 401) notifyAdminUnauthorized();
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section className="relative w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-black/6 px-6 py-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-100 p-2 text-neutral-500"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function priceRange(product: ProductListItem): string {
  if (!product.minPrice) return '未定价';
  if (!product.maxPrice || product.maxPrice === product.minPrice) {
    return `¥${product.minPrice}`;
  }
  return `¥${product.minPrice} – ${product.maxPrice}`;
}

export function ProductsManager({
  permissions,
}: {
  permissions: { edit: boolean; publish: boolean };
}) {
  const [result, setResult] = useState<ListResult<ProductListItem> | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (keyword) params.set('keyword', keyword);
    if (categoryId) params.set('categoryId', categoryId);
    if (status) params.set('status', status);
    try {
      const [products, categoryResult] = await Promise.all([
        apiRequest<ListResult<ProductListItem>>(
          `/api/admin/products?${params}`,
        ),
        apiRequest<{ list: CategoryNode[] }>('/api/admin/categories'),
      ]);
      setResult(products);
      setCategories(categoryResult.list);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '商品加载失败');
    } finally {
      setLoading(false);
    }
  }, [categoryId, keyword, page, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function changeStatus(product: ProductListItem): Promise<void> {
    setBusyId(product.id);
    setError('');
    const nextStatus = product.status === 'on_sale' ? 'off_shelf' : 'on_sale';
    try {
      await apiRequest(`/api/admin/products/${product.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(nextStatus === 'on_sale' ? '商品已上架' : '商品已下架');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await apiRequest(`/api/admin/products/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      setNotice('商品已删除');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusyId('');
    }
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            PRODUCTS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            商品管理
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            管理商品资料、销售状态、变体组合与耗材 BOM。
          </p>
        </div>
        {permissions.edit ? (
          <Link
            href="/admin/products/new"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white hover:bg-black"
          >
            <Plus className="size-4" />
            新增商品
          </Link>
        ) : null}
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">商品总数</p>
          <p className="mt-1 text-2xl font-semibold">{result?.total ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">当前页在售</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {loading
              ? '—'
              : (result?.list.filter((item) => item.status === 'on_sale')
                  .length ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">当前页变体</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading
              ? '—'
              : (result?.list.reduce(
                  (total, item) => total + item.variantCount,
                  0,
                ) ?? 0)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
        <form
          className="flex flex-col gap-3 border-b border-black/6 p-4 lg:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setKeyword(keywordInput.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              className="h-11 w-full rounded-xl border border-black/10 pr-3 pl-10 text-sm outline-none focus:border-neutral-500"
              placeholder="搜索商品名称或 Slug"
            />
          </div>
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm lg:w-48"
          >
            <option value="">全部分类</option>
            {categories.map((root) => (
              <optgroup key={root.id} label={root.name}>
                <option value={root.id}>{root.name}</option>
                {root.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm lg:w-36"
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="on_sale">在售</option>
            <option value="off_shelf">已下架</option>
          </select>
          <button className="h-11 rounded-xl bg-neutral-100 px-5 text-sm font-medium">
            查询
          </button>
          <button
            type="button"
            title="刷新"
            onClick={() => void load()}
            className="grid size-11 place-items-center rounded-xl border border-black/10 text-neutral-500"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>

        {error ? (
          <div className="m-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <CircleAlert className="size-4" />
            {error}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-neutral-50/70 text-xs text-neutral-400">
              <tr>
                <th className="px-5 py-3.5 font-medium">商品</th>
                <th className="px-4 py-3.5 font-medium">分类</th>
                <th className="px-4 py-3.5 font-medium">价格</th>
                <th className="px-4 py-3.5 font-medium">变体</th>
                <th className="px-4 py-3.5 font-medium">状态</th>
                <th className="px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="grid h-56 place-items-center text-neutral-400">
                      <LoaderCircle className="size-6 animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading && result?.list.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex h-60 flex-col items-center justify-center text-neutral-400">
                      <PackageOpen className="size-9" />
                      <p className="mt-3">暂无符合条件的商品</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading
                ? result?.list.map((product) => (
                    <tr
                      key={product.id}
                      className="border-t border-black/5 hover:bg-neutral-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-300">
                            {product.mainImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.mainImageUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="size-5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-semibold">
                              {product.name}
                              {product.isFeatured ? (
                                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                              ) : null}
                            </p>
                            <p className="mt-1 font-mono text-xs text-neutral-400">
                              /products/{product.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-500">
                        {product.categoryName ?? '未分类'}
                      </td>
                      <td className="px-4 py-4 font-semibold tabular-nums">
                        {priceRange(product)}
                      </td>
                      <td className="px-4 py-4">
                        <p>{product.variantCount} 个</p>
                        <p className="mt-1 text-xs text-neutral-400">
                          {product.activeVariantCount} 个启用
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[product.status]}`}
                        >
                          {statusLabels[product.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {permissions.publish ? (
                            <button
                              type="button"
                              title={
                                product.status === 'on_sale' ? '下架' : '上架'
                              }
                              disabled={busyId === product.id}
                              onClick={() => void changeStatus(product)}
                              className={`rounded-lg p-2 ${product.status === 'on_sale' ? 'text-emerald-600 hover:bg-amber-50 hover:text-amber-700' : 'text-neutral-400 hover:bg-emerald-50 hover:text-emerald-700'}`}
                            >
                              {busyId === product.id ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : product.status === 'on_sale' ? (
                                <EyeOff className="size-4" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                            </button>
                          ) : null}
                          {permissions.edit ? (
                            <Link
                              href={`/admin/products/${product.id}`}
                              title="编辑"
                              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                            >
                              <Pencil className="size-4" />
                            </Link>
                          ) : null}
                          {permissions.edit ? (
                            <button
                              type="button"
                              title="删除"
                              onClick={() => setDeleteTarget(product)}
                              className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/6 px-5 py-4 text-sm text-neutral-500">
          <span>共 {result?.total ?? 0} 条</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="grid size-9 place-items-center rounded-lg border border-black/10 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-16 text-center">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="grid size-9 place-items-center rounded-lg border border-black/10 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {deleteTarget ? (
        <Modal title="确认删除商品" onClose={() => setDeleteTarget(null)}>
          <div className="px-6 py-6">
            <div className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
              确定删除 <strong>{deleteTarget.name}</strong>
              ？商品将立即下架并从后台列表隐藏，历史订单不会受影响。
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-6 py-4">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busyId === deleteTarget.id}
              onClick={() => void remove()}
              className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busyId === deleteTarget.id ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              确认删除
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
