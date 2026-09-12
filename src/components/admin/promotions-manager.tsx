'use client';

import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

type DiscountType = 'fixed_amount' | 'percentage' | 'free_shipping';
type PromotionScope = 'all' | 'category' | 'product';

interface Promotion {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string | null;
  scope: PromotionScope;
  scopeIds: string[];
  isActive: boolean;
  codeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PromotionListResult {
  list: Promotion[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface PromotionForm {
  name: string;
  discountType: DiscountType;
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  scope: PromotionScope;
  scopeIds: string;
  isActive: boolean;
}

const emptyForm: PromotionForm = {
  name: '',
  discountType: 'fixed_amount',
  discountValue: '',
  minOrderAmount: '0',
  maxDiscountAmount: '',
  scope: 'all',
  scopeIds: '',
  isActive: true,
};

const typeLabels: Record<DiscountType, string> = {
  fixed_amount: '满减',
  percentage: '折扣',
  free_shipping: '包邮',
};

const scopeLabels: Record<PromotionScope, string> = {
  all: '全场',
  category: '指定分类',
  product: '指定商品',
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    cache: 'no-store',
  });
  const result = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    notifyAdminUnauthorized();
    throw new Error('后台登录已失效');
  }
  if (!response.ok || result.data === null) {
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

function describePromotion(promotion: Promotion): string {
  if (promotion.discountType === 'fixed_amount') {
    return `减 ¥${promotion.discountValue}`;
  }
  if (promotion.discountType === 'percentage') {
    return `${Number(promotion.discountValue) * 10} 折${promotion.maxDiscountAmount ? `，最高减 ¥${promotion.maxDiscountAmount}` : ''}`;
  }
  return '免运费';
}

function formFromPromotion(promotion: Promotion): PromotionForm {
  return {
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    minOrderAmount: promotion.minOrderAmount,
    maxDiscountAmount: promotion.maxDiscountAmount ?? '',
    scope: promotion.scope,
    scopeIds: promotion.scopeIds.join('\n'),
    isActive: promotion.isActive,
  };
}

export function PromotionsManager({ canEdit }: { canEdit: boolean }) {
  const [result, setResult] = useState<PromotionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [discountType, setDiscountType] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const [form, setForm] = useState<PromotionForm>(emptyForm);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (keyword) params.set('keyword', keyword);
    if (discountType) params.set('discountType', discountType);
    if (activeFilter) params.set('isActive', activeFilter);
    try {
      setResult(
        await apiRequest<PromotionListResult>(
          `/api/admin/promotions?${params}`,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '优惠规则加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, discountType, keyword, page]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openEditor(target: Promotion | 'new'): void {
    setEditing(target);
    setForm(target === 'new' ? emptyForm : formFromPromotion(target));
    setError('');
  }

  function payloadFromForm() {
    const scopeIds = form.scopeIds
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
    return {
      name: form.name.trim(),
      discountType: form.discountType,
      discountValue:
        form.discountType === 'free_shipping' ? '0' : form.discountValue.trim(),
      minOrderAmount: form.minOrderAmount.trim(),
      maxDiscountAmount:
        form.discountType === 'percentage' && form.maxDiscountAmount.trim()
          ? form.maxDiscountAmount.trim()
          : null,
      scope: form.scope,
      scopeIds: form.scope === 'all' ? [] : scopeIds,
      isActive: form.isActive,
    };
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editing) return;
    setBusy('save');
    setError('');
    try {
      const isNew = editing === 'new';
      await apiRequest(
        isNew ? '/api/admin/promotions' : `/api/admin/promotions/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          body: JSON.stringify(payloadFromForm()),
        },
      );
      setEditing(null);
      setNotice(isNew ? '优惠规则已创建' : '优惠规则已更新');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function toggle(promotion: Promotion): Promise<void> {
    setBusy(promotion.id);
    setError('');
    try {
      await apiRequest(`/api/admin/promotions/${promotion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !promotion.isActive }),
      });
      setNotice(promotion.isActive ? '优惠规则已停用' : '优惠规则已启用');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setBusy('');
    }
  }

  async function remove(promotion: Promotion): Promise<void> {
    if (
      !window.confirm(
        promotion.codeCount
          ? '该规则已关联折扣码，无法删除；可改为停用。'
          : `确认删除优惠规则“${promotion.name}”？`,
      ) ||
      promotion.codeCount
    )
      return;
    setBusy(promotion.id);
    setError('');
    try {
      await apiRequest(`/api/admin/promotions/${promotion.id}`, {
        method: 'DELETE',
      });
      setNotice('优惠规则已删除');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusy('');
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
            PROMOTIONS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            优惠规则
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            定义满减、折扣或包邮逻辑；折扣码将在下一任务中关联规则。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/8 bg-white px-4 text-sm font-medium"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => openEditor('new')}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-4 text-sm font-medium text-white"
            >
              <Plus className="size-4" /> 新增规则
            </button>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setKeyword(keywordInput.trim());
        }}
        className="mt-7 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_180px_160px_auto]"
      >
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="规则名称"
            className="h-10 w-full rounded-xl border border-black/8 pl-10 text-sm outline-none"
          />
        </label>
        <select
          value={discountType}
          onChange={(event) => {
            setDiscountType(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        >
          <option value="">全部类型</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(event) => {
            setActiveFilter(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        >
          <option value="">全部状态</option>
          <option value="true">已启用</option>
          <option value="false">已停用</option>
        </select>
        <button className="h-10 rounded-xl bg-lime-300 px-5 text-sm font-semibold">
          查询
        </button>
      </form>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <CircleAlert className="size-4" /> {error}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">规则</th>
                <th className="px-5 py-3 font-medium">优惠内容</th>
                <th className="px-5 py-3 font-medium">门槛 / 范围</th>
                <th className="px-5 py-3 font-medium">关联码</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading && !result ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-20 text-center text-neutral-400"
                  >
                    <LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />
                    加载中
                  </td>
                </tr>
              ) : result?.list.length ? (
                result.list.map((promotion) => (
                  <tr key={promotion.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{promotion.name}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {typeLabels[promotion.discountType]}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-medium">
                      {describePromotion(promotion)}
                    </td>
                    <td className="px-5 py-4">
                      <p>满 ¥{promotion.minOrderAmount}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {scopeLabels[promotion.scope]}
                        {promotion.scopeIds.length
                          ? ` · ${promotion.scopeIds.length} 项`
                          : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4">{promotion.codeCount} 个</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${promotion.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}
                      >
                        {promotion.isActive ? '已启用' : '已停用'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {canEdit ? (
                          <>
                            <button
                              disabled={busy !== ''}
                              onClick={() => void toggle(promotion)}
                              className="rounded-lg border border-black/8 px-3 py-2 text-xs font-medium disabled:opacity-40"
                            >
                              {promotion.isActive ? '停用' : '启用'}
                            </button>
                            <button
                              disabled={busy !== ''}
                              onClick={() => openEditor(promotion)}
                              className="rounded-lg border border-black/8 p-2 disabled:opacity-40"
                              title="编辑"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              disabled={busy !== '' || promotion.codeCount > 0}
                              onClick={() => void remove(promotion)}
                              className="rounded-lg border border-rose-100 p-2 text-rose-600 disabled:opacity-25"
                              title={
                                promotion.codeCount
                                  ? '已关联折扣码，不能删除'
                                  : '删除'
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="py-20 text-center text-neutral-400"
                  >
                    <BadgePercent className="mx-auto mb-3 size-8 opacity-40" />
                    暂无优惠规则
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/6 px-5 py-4 text-sm">
          <span className="text-neutral-500">共 {result?.total ?? 0} 条</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border border-black/8 p-2 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-20 text-center text-xs text-neutral-500">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-black/8 p-2 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <section className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/6 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {editing === 'new' ? '新增优惠规则' : '编辑优惠规则'}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  优惠门槛只比较商品小计，不包含运费。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl bg-neutral-100 p-2 text-neutral-500"
              >
                <X className="size-5" />
              </button>
            </div>
            <form
              onSubmit={(event) => void save(event)}
              className="space-y-5 p-6"
            >
              <label className="block text-sm font-medium">
                规则名称
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, name: event.target.value }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3 outline-none"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  优惠类型
                  <select
                    value={form.discountType}
                    onChange={(event) => {
                      const type = event.target.value as DiscountType;
                      setForm((value) => ({
                        ...value,
                        discountType: type,
                        discountValue: type === 'free_shipping' ? '0' : '',
                        maxDiscountAmount: '',
                      }));
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  >
                    <option value="fixed_amount">满减</option>
                    <option value="percentage">折扣</option>
                    <option value="free_shipping">包邮</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  使用门槛（元）
                  <input
                    required
                    inputMode="decimal"
                    value={form.minOrderAmount}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        minOrderAmount: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  />
                  <span className="mt-1.5 block text-xs font-normal text-neutral-400">
                    仅比较商品小计
                  </span>
                </label>
              </div>
              {form.discountType !== 'free_shipping' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    {form.discountType === 'fixed_amount'
                      ? '减免金额（元）'
                      : '折扣率'}
                    <input
                      required
                      inputMode="decimal"
                      value={form.discountValue}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          discountValue: event.target.value,
                        }))
                      }
                      placeholder={
                        form.discountType === 'percentage'
                          ? '0.9 表示九折'
                          : '10.00'
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                    />
                  </label>
                  {form.discountType === 'percentage' ? (
                    <label className="block text-sm font-medium">
                      最高减免（选填）
                      <input
                        inputMode="decimal"
                        value={form.maxDiscountAmount}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            maxDiscountAmount: event.target.value,
                          }))
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                      />
                    </label>
                  ) : (
                    <div className="rounded-xl bg-neutral-50 p-4 text-xs leading-5 text-neutral-500">
                      满减金额会被限制为不超过商品小计，不能抵扣运费。
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-800">
                  包邮规则只减免运费，不改变商品金额。
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  适用范围
                  <select
                    value={form.scope}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        scope: event.target.value as PromotionScope,
                        scopeIds: '',
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  >
                    <option value="all">全场</option>
                    <option value="category">指定分类</option>
                    <option value="product">指定商品</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-black/8 px-4 py-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        isActive: event.target.checked,
                      }))
                    }
                    className="size-4"
                  />
                  创建后立即启用
                </label>
              </div>
              {form.scope !== 'all' ? (
                <label className="block text-sm font-medium">
                  {form.scope === 'category' ? '分类 ID' : '商品 ID'}
                  （每行一个）
                  <textarea
                    required
                    rows={4}
                    value={form.scopeIds}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        scopeIds: event.target.value,
                      }))
                    }
                    className="mt-2 w-full resize-y rounded-xl border border-black/8 p-3 font-mono text-xs outline-none"
                  />
                  <span className="mt-1.5 block text-xs font-normal text-amber-600">
                    字段已完整保留；第一版下单仅支持全场规则，指定范围规则请保持停用。
                  </span>
                </label>
              ) : null}
              <button
                disabled={busy !== ''}
                type="submit"
                className="h-11 w-full rounded-xl bg-[#151816] text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'save' ? '保存中…' : '保存优惠规则'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
