'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface UserSummary {
  id: string;
  phone: string;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: string;
}

interface UserListResult {
  list: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface UserAddress {
  id: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  postalCode: string | null;
  isDefault: boolean;
}

interface UserOrder {
  orderNo: string;
  status: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  createdAt: string;
  paidAt: string | null;
}

interface UserDetail extends UserSummary {
  updatedAt: string;
  addresses: UserAddress[];
  orders: UserOrder[];
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const statusLabels: Record<string, string> = {
  pending_payment: '待支付',
  paid: '已支付',
  in_production: '生产中',
  pending_shipment: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
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

export function UsersManager({ canDisable }: { canDisable: boolean }) {
  const [result, setResult] = useState<UserListResult | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (keyword) params.set('keyword', keyword);
    if (status) params.set('status', status);
    try {
      setResult(await apiRequest<UserListResult>(`/api/admin/users?${params}`));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, status]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function showDetail(user: UserSummary): Promise<void> {
    setDetailLoading(true);
    setError('');
    try {
      setDetail(await apiRequest<UserDetail>(`/api/admin/users/${user.id}`));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '用户详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggle(user: UserSummary | UserDetail): Promise<void> {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    if (
      !window.confirm(
        nextStatus === 'disabled'
          ? `确认禁用用户 ${user.phone}？禁用后其当前登录态也无法继续访问和下单。`
          : `确认重新启用用户 ${user.phone}？`,
      )
    )
      return;
    setBusy(user.id);
    setError('');
    try {
      await apiRequest(`/api/admin/users/${user.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(nextStatus === 'disabled' ? '用户已禁用' : '用户已启用');
      if (detail?.id === user.id) {
        setDetail((current) =>
          current ? { ...current, status: nextStatus } : current,
        );
      }
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
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
            CUSTOMERS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            用户管理
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            查看用户订单与地址，控制账号是否允许登录和下单。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-black/8 bg-white px-4 text-sm font-medium"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setKeyword(keywordInput.trim());
        }}
        className="mt-7 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm md:grid-cols-[minmax(260px,1fr)_180px_auto]"
      >
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="手机号或昵称"
            className="h-10 w-full rounded-xl border border-black/8 pl-10 text-sm outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="disabled">已禁用</option>
        </select>
        <button className="h-10 rounded-xl bg-lime-300 px-5 text-sm font-semibold">
          查询
        </button>
      </form>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <CircleAlert className="size-4" />
          {error}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">用户</th>
                <th className="px-5 py-3 font-medium">注册 / 最近登录</th>
                <th className="px-5 py-3 font-medium">订单数</th>
                <th className="px-5 py-3 font-medium">累计消费</th>
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
                result.list.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold">
                        {user.nickname || '未设置昵称'}
                      </p>
                      <p className="mt-1 font-mono text-xs text-neutral-400">
                        {user.phone}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs leading-5 text-neutral-500">
                      <p>{formatDate(user.createdAt)}</p>
                      <p>登录：{formatDate(user.lastLoginAt)}</p>
                    </td>
                    <td className="px-5 py-4">{user.orderCount} 单</td>
                    <td className="px-5 py-4 font-semibold">
                      ¥{user.totalSpent}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                      >
                        {user.status === 'active' ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={detailLoading}
                          onClick={() => void showDetail(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-black/8 px-3 py-2 text-xs disabled:opacity-40"
                        >
                          <Eye className="size-3.5" />
                          详情
                        </button>
                        {canDisable ? (
                          <button
                            disabled={busy !== ''}
                            onClick={() => void toggle(user)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40 ${user.status === 'active' ? 'border-rose-100 text-rose-700' : 'border-emerald-100 text-emerald-700'}`}
                          >
                            {user.status === 'active' ? (
                              <ShieldOff className="size-3.5" />
                            ) : (
                              <ShieldCheck className="size-3.5" />
                            )}
                            {user.status === 'active' ? '禁用' : '启用'}
                          </button>
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
                    <Users className="mx-auto mb-3 size-8 opacity-40" />
                    暂无用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/6 px-5 py-4 text-sm">
          <span className="text-neutral-500">共 {result?.total ?? 0} 位</span>
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

      {detail ? (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <button
            type="button"
            aria-label="关闭用户详情"
            onClick={() => setDetail(null)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-neutral-400">
                  USER DETAIL
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {detail.nickname || '未设置昵称'}
                </h2>
                <p className="mt-1 font-mono text-sm text-neutral-500">
                  {detail.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl bg-neutral-100 p-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-xs text-neutral-400">订单数</p>
                <p className="mt-2 text-xl font-semibold">
                  {detail.orderCount}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-xs text-neutral-400">累计消费</p>
                <p className="mt-2 text-xl font-semibold">
                  ¥{detail.totalSpent}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-xs text-neutral-400">账号状态</p>
                <p className="mt-2 text-xl font-semibold">
                  {detail.status === 'active' ? '正常' : '禁用'}
                </p>
              </div>
            </div>
            {canDisable ? (
              <button
                disabled={busy !== ''}
                onClick={() => void toggle(detail)}
                className={`mt-4 h-10 w-full rounded-xl border text-sm font-semibold disabled:opacity-40 ${detail.status === 'active' ? 'border-rose-200 text-rose-700' : 'border-emerald-200 text-emerald-700'}`}
              >
                {detail.status === 'active' ? '禁用该用户' : '重新启用该用户'}
              </button>
            ) : null}
            <section className="mt-7">
              <h3 className="font-semibold">收货地址</h3>
              {detail.addresses.length ? (
                <div className="mt-3 space-y-3">
                  {detail.addresses.map((address) => (
                    <div
                      key={address.id}
                      className="rounded-xl border border-black/6 p-4 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {address.receiverName}
                        </span>
                        <span className="text-neutral-500">
                          {address.receiverPhone}
                        </span>
                        {address.isDefault ? (
                          <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-semibold text-lime-800">
                            默认
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 leading-6 text-neutral-500">
                        {address.province}
                        {address.city}
                        {address.district}
                        {address.detail}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">暂无地址</p>
              )}
            </section>
            <section className="mt-7">
              <h3 className="font-semibold">订单历史</h3>
              {detail.orders.length ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-black/6">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">订单号</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">实付 / 退款</th>
                        <th className="px-4 py-3 font-medium">下单时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {detail.orders.map((order) => (
                        <tr key={order.orderNo}>
                          <td className="px-4 py-3 font-medium">
                            {order.orderNo}
                          </td>
                          <td className="px-4 py-3">
                            {statusLabels[order.status] ?? order.status}
                          </td>
                          <td className="px-4 py-3">
                            ¥{order.paidAmount} / ¥{order.refundedAmount}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-500">
                            {formatDate(order.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">暂无订单</p>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
