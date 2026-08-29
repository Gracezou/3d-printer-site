'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  TicketPercent,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type CodeType = 'permanent' | 'limited';
type CodeStatus =
  'active' | 'disabled' | 'not_started' | 'expired' | 'exhausted';

interface DiscountCode {
  id: string;
  promotionId: string;
  promotionName: string;
  promotionActive: boolean;
  code: string;
  codeType: CodeType;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  remark: string | null;
  status: CodeStatus;
  redemptionCount: number;
}

interface PromotionOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface ListResult {
  list: DiscountCode[];
  total: number;
  page: number;
  pageSize: number;
  promotionOptions: PromotionOption[];
}

interface Redemption {
  id: string;
  orderNo: string;
  userPhone: string;
  discountAmount: string;
  status: string;
  createdAt: string;
  releasedAt: string | null;
}

interface RedemptionResult {
  list: Redemption[];
  total: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface CodeForm {
  promotionId: string;
  code: string;
  codeType: CodeType;
  maxUses: string;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
  remark: string;
  isActive: boolean;
}

const statusLabels: Record<CodeStatus, string> = {
  active: '生效中',
  disabled: '已停用',
  not_started: '未开始',
  expired: '已过期',
  exhausted: '已用完',
};

const statusTones: Record<CodeStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  disabled: 'bg-neutral-100 text-neutral-500',
  not_started: 'bg-sky-50 text-sky-700',
  expired: 'bg-amber-50 text-amber-700',
  exhausted: 'bg-rose-50 text-rose-700',
};

function dateTimeInput(value?: string | Date): string {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function emptyForm(promotionId = ''): CodeForm {
  return {
    promotionId,
    code: '',
    codeType: 'limited',
    maxUses: '100',
    perUserLimit: '1',
    startsAt: dateTimeInput(),
    endsAt: '',
    remark: '',
    isActive: true,
  };
}

function formFromCode(code: DiscountCode): CodeForm {
  return {
    promotionId: code.promotionId,
    code: code.code,
    codeType: code.codeType,
    maxUses: code.maxUses === null ? '' : String(code.maxUses),
    perUserLimit: String(code.perUserLimit),
    startsAt: dateTimeInput(code.startsAt),
    endsAt: code.endsAt ? dateTimeInput(code.endsAt) : '',
    remark: code.remark ?? '',
    isActive: code.isActive,
  };
}

function formatDate(value: string | null): string {
  if (!value) return '不限期';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    cache: 'no-store',
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    window.location.assign('/admin/login');
    throw new Error('后台登录已失效');
  }
  if (!response.ok || body.data === null)
    throw new Error(body.message || '请求失败');
  return body.data;
}

export function DiscountCodesManager({ canEdit }: { canEdit: boolean }) {
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [codeType, setCodeType] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DiscountCode | 'new' | null>(null);
  const [form, setForm] = useState<CodeForm>(emptyForm());
  const [busy, setBusy] = useState('');
  const [redemptionCode, setRedemptionCode] = useState<DiscountCode | null>(
    null,
  );
  const [redemptions, setRedemptions] = useState<RedemptionResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (keyword) params.set('keyword', keyword);
    if (status) params.set('status', status);
    if (codeType) params.set('codeType', codeType);
    try {
      setResult(
        await apiRequest<ListResult>(`/api/admin/discount-codes?${params}`),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '折扣码加载失败');
    } finally {
      setLoading(false);
    }
  }, [codeType, keyword, page, status]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openEditor(target: DiscountCode | 'new'): void {
    setEditing(target);
    setForm(
      target === 'new'
        ? emptyForm(result?.promotionOptions[0]?.id)
        : formFromCode(target),
    );
    setError('');
  }

  function payloadFromForm() {
    return {
      promotionId: form.promotionId,
      code: form.code.trim(),
      codeType: form.codeType,
      maxUses:
        form.codeType === 'permanent' ? null : Number(form.maxUses.trim()),
      perUserLimit: Number(form.perUserLimit.trim()),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      remark: form.remark.trim() || null,
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
        isNew
          ? '/api/admin/discount-codes'
          : `/api/admin/discount-codes/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          body: JSON.stringify(payloadFromForm()),
        },
      );
      setEditing(null);
      setNotice(isNew ? '折扣码已创建' : '折扣码已更新');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function toggle(code: DiscountCode): Promise<void> {
    setBusy(code.id);
    setError('');
    try {
      await apiRequest(`/api/admin/discount-codes/${code.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ isActive: !code.isActive }),
      });
      setNotice(code.isActive ? '折扣码已停用并即时生效' : '折扣码已启用');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setBusy('');
    }
  }

  async function remove(code: DiscountCode): Promise<void> {
    if (
      !window.confirm(
        code.redemptionCount
          ? '该折扣码已有核销记录，不能删除；请改为停用。'
          : `确认删除折扣码 ${code.code}？`,
      ) ||
      code.redemptionCount
    )
      return;
    setBusy(code.id);
    setError('');
    try {
      await apiRequest(`/api/admin/discount-codes/${code.id}`, {
        method: 'DELETE',
      });
      setNotice('折扣码已删除');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusy('');
    }
  }

  async function showRedemptions(code: DiscountCode): Promise<void> {
    setRedemptionCode(code);
    setRedemptions(null);
    setError('');
    try {
      setRedemptions(
        await apiRequest<RedemptionResult>(
          `/api/admin/discount-codes/${code.id}/redemptions?pageSize=100`,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '核销记录加载失败');
      setRedemptionCode(null);
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
            DISCOUNT CODES
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">折扣码</h1>
          <p className="mt-2 text-sm text-neutral-500">
            管理有效期、总核销次数和单用户限次；关闭开关后立即不可用。
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
              disabled={!result?.promotionOptions.length}
              onClick={() => openEditor('new')}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              <Plus className="size-4" /> 新增折扣码
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
        className="mt-7 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_160px_160px_auto]"
      >
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="搜索折扣码"
            className="h-10 w-full rounded-xl border border-black/8 pl-10 text-sm outline-none"
          />
        </label>
        <select
          value={codeType}
          onChange={(event) => {
            setCodeType(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        >
          <option value="">全部类型</option>
          <option value="permanent">常驻码</option>
          <option value="limited">限次码</option>
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
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
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">折扣码 / 规则</th>
                <th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">使用量</th>
                <th className="px-5 py-3 font-medium">单用户限次</th>
                <th className="px-5 py-3 font-medium">有效期</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading && !result ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-20 text-center text-neutral-400"
                  >
                    <LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />
                    加载中
                  </td>
                </tr>
              ) : result?.list.length ? (
                result.list.map((code) => (
                  <tr key={code.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-4">
                      <p className="font-mono font-semibold tracking-wide">
                        {code.code}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {code.promotionName}
                        {!code.promotionActive ? ' · 规则已停用' : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {code.codeType === 'permanent' ? '常驻' : '限次'}
                    </td>
                    <td className="px-5 py-4 font-medium">
                      {code.usedCount} / {code.maxUses ?? '不限'}
                    </td>
                    <td className="px-5 py-4">每人 {code.perUserLimit} 次</td>
                    <td className="px-5 py-4 text-xs leading-5 text-neutral-500">
                      <p>{formatDate(code.startsAt)}</p>
                      <p>至 {formatDate(code.endsAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTones[code.status]}`}
                      >
                        {statusLabels[code.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={busy !== ''}
                          onClick={() => void showRedemptions(code)}
                          className="inline-flex items-center gap-1 rounded-lg border border-black/8 px-3 py-2 text-xs disabled:opacity-40"
                        >
                          <Eye className="size-3.5" /> 核销{' '}
                          {code.redemptionCount}
                        </button>
                        {canEdit ? (
                          <>
                            <button
                              disabled={busy !== ''}
                              onClick={() => void toggle(code)}
                              className="rounded-lg border border-black/8 px-3 py-2 text-xs font-medium disabled:opacity-40"
                            >
                              {code.isActive ? '停用' : '启用'}
                            </button>
                            <button
                              disabled={busy !== ''}
                              onClick={() => openEditor(code)}
                              className="rounded-lg border border-black/8 p-2 disabled:opacity-40"
                              title="编辑"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              disabled={busy !== '' || code.redemptionCount > 0}
                              onClick={() => void remove(code)}
                              className="rounded-lg border border-rose-100 p-2 text-rose-600 disabled:opacity-25"
                              title="删除"
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
                    colSpan={7}
                    className="py-20 text-center text-neutral-400"
                  >
                    <TicketPercent className="mx-auto mb-3 size-8 opacity-40" />
                    暂无折扣码
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
                  {editing === 'new' ? '新增折扣码' : '编辑折扣码'}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  折扣码保存时统一转换为大写。
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
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  折扣码
                  <input
                    required
                    maxLength={32}
                    value={form.code}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        code: event.target.value.toUpperCase(),
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3 font-mono uppercase outline-none"
                  />
                </label>
                <label className="block text-sm font-medium">
                  关联优惠规则
                  <select
                    required
                    value={form.promotionId}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        promotionId: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  >
                    {result?.promotionOptions.map((promotion) => (
                      <option key={promotion.id} value={promotion.id}>
                        {promotion.name}
                        {promotion.isActive ? '' : '（已停用）'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                  码类型
                  <select
                    value={form.codeType}
                    onChange={(event) => {
                      const type = event.target.value as CodeType;
                      setForm((value) => ({
                        ...value,
                        codeType: type,
                        maxUses:
                          type === 'permanent' ? '' : value.maxUses || '100',
                      }));
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  >
                    <option value="limited">限次码</option>
                    <option value="permanent">常驻码</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  总次数
                  <input
                    required={form.codeType === 'limited'}
                    disabled={form.codeType === 'permanent'}
                    type="number"
                    min={1}
                    value={form.maxUses}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        maxUses: event.target.value,
                      }))
                    }
                    placeholder={form.codeType === 'permanent' ? '不限' : '100'}
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3 disabled:bg-neutral-50"
                  />
                </label>
                <label className="block text-sm font-medium">
                  单用户限次
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.perUserLimit}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        perUserLimit: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  />
                </label>
              </div>
              {form.codeType === 'permanent' ? (
                <p className="rounded-xl bg-sky-50 p-4 text-xs leading-5 text-sky-800">
                  常驻码不限制总使用次数，数据库中的总次数固定为空；仍受有效期、开关和单用户限次控制。
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  生效时间
                  <input
                    required
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        startsAt: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  />
                </label>
                <label className="block text-sm font-medium">
                  失效时间（选填）
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        endsAt: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-black/8 px-3"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                备注
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.remark}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      remark: event.target.value,
                    }))
                  }
                  className="mt-2 w-full resize-y rounded-xl border border-black/8 p-3"
                />
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
                保存后启用
              </label>
              <button
                disabled={busy !== ''}
                type="submit"
                className="h-11 w-full rounded-xl bg-[#151816] text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'save' ? '保存中…' : '保存折扣码'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {redemptionCode ? (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <button
            type="button"
            aria-label="关闭核销记录"
            onClick={() => setRedemptionCode(null)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-neutral-400">
                  REDEMPTIONS
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {redemptionCode.code} 核销记录
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRedemptionCode(null)}
                className="rounded-xl bg-neutral-100 p-2"
              >
                <X className="size-5" />
              </button>
            </div>
            {!redemptions ? (
              <LoaderCircle className="mx-auto mt-24 size-6 animate-spin text-neutral-400" />
            ) : redemptions.list.length ? (
              <div className="mt-6 space-y-3">
                {redemptions.list.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="rounded-xl bg-neutral-50 p-4"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold">
                        {redemption.orderNo}
                      </span>
                      <span className="font-medium">
                        -¥{redemption.discountAmount}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      {redemption.userPhone} · {redemption.status} ·{' '}
                      {formatDate(redemption.createdAt)}
                    </p>
                  </div>
                ))}
                <p className="pt-2 text-center text-xs text-neutral-400">
                  共 {redemptions.total} 条，当前展示前 100 条
                </p>
              </div>
            ) : (
              <p className="mt-20 text-center text-sm text-neutral-400">
                暂无核销记录
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
