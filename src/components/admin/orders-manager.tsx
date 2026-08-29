'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface OrderListItem {
  id: string;
  orderNo: string;
  status: string;
  userPhone: string;
  receiverName: string;
  receiverPhone: string;
  payableAmount: string;
  paidAmount: string;
  paidAt: string | null;
  shippedAt: string | null;
  createdAt: string;
  itemCount: number;
}

interface ListResult {
  list: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
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

const statusStyles: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700',
  paid: 'bg-sky-50 text-sky-700',
  in_production: 'bg-violet-50 text-violet-700',
  pending_shipment: 'bg-orange-50 text-orange-700',
  shipped: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
  refunding: 'bg-rose-50 text-rose-700',
  refunded: 'bg-neutral-100 text-neutral-500',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function OrdersManager({ canExport }: { canExport: boolean }) {
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const searchParams = useCallback(
    (includePage = true) => {
      const params = new URLSearchParams();
      if (includePage) {
        params.set('page', String(page));
        params.set('pageSize', '20');
      }
      if (keyword) params.set('keyword', keyword);
      if (status) params.set('status', status);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return params;
    },
    [endDate, keyword, page, startDate, status],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/orders?${searchParams()}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as ApiEnvelope<ListResult>;
      if (response.status === 401) {
        window.location.assign('/admin/login');
        return;
      }
      if (!response.ok || !body.data) throw new Error(body.message);
      setResult(body.data);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '订单加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => void load(), [load]);

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            ORDERS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            订单管理
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            查询订单、处理备注、取消与发货，金额与商品信息均为下单快照。
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
          {canExport ? (
            <a
              href={`/api/admin/orders/export?${searchParams(false)}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-4 text-sm font-medium text-white"
            >
              <Download className="size-4" /> 导出 CSV
            </a>
          ) : null}
        </div>
      </div>

      <form
        className="mt-7 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_180px_160px_160px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setKeyword(keywordInput.trim());
        }}
      >
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="订单号或收货手机号"
            className="h-10 w-full rounded-xl border border-black/8 pl-10 text-sm outline-none focus:border-neutral-400"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm outline-none"
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="开始日期"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        />
        <input
          type="date"
          aria-label="结束日期"
          value={endDate}
          onChange={(event) => {
            setEndDate(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-black/8 px-3 text-sm"
        />
        <button className="h-10 rounded-xl bg-lime-300 px-5 text-sm font-semibold">
          查询
        </button>
      </form>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">订单</th>
                <th className="px-5 py-3 font-medium">客户 / 收货人</th>
                <th className="px-5 py-3 font-medium">金额</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">下单时间</th>
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
                result.list.map((order) => (
                  <tr key={order.id} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{order.orderNo}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        共 {order.itemCount} 件
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p>
                        {order.receiverName} · {order.receiverPhone}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        账号 {order.userPhone}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">¥{order.payableAmount}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        实付 ¥{order.paidAmount}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[order.status] ?? 'bg-neutral-100'}`}
                      >
                        {statusLabels[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-600">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-black/8 px-3 py-2 text-xs font-medium"
                      >
                        <Eye className="size-3.5" />
                        详情
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="py-20 text-center text-neutral-400"
                  >
                    <PackageSearch className="mx-auto mb-3 size-8 opacity-40" />
                    暂无符合条件的订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/6 px-5 py-4 text-sm">
          <span className="text-neutral-500">
            共 {result?.total ?? 0} 笔订单
          </span>
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
    </div>
  );
}
