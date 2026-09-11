'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  PackageOpen,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface OrderItemSummary {
  productName: string;
  variantName: string;
  imageUrl: string | null;
  quantity: number;
}

interface OrderSummary {
  orderNo: string;
  status: string;
  statusText: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  reservedUntil: string | null;
  createdAt: string;
  items: OrderItemSummary[];
}

interface OrderListResult {
  list: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const tabs = [
  { value: 'all', label: '全部' },
  { value: 'pending_payment', label: '待支付' },
  { value: 'in_production', label: '生产中' },
  { value: 'shipped', label: '待收货' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消/退款' },
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function apiRequest<T>(
  url: string,
  init: RequestInit | undefined,
  onUnauthorized: () => void,
): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    onUnauthorized();
    throw new Error('请先登录');
  }
  if (!response.ok || body.data === null)
    throw new Error(body.message || '请求失败');
  return body.data;
}

export function OrdersManager() {
  const router = useRouter();
  const [result, setResult] = useState<OrderListResult | null>(null);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        pageSize: '10',
      });
      setResult(
        await apiRequest<OrderListResult>(
          `/api/orders?${params}`,
          undefined,
          () => router.replace('/auth/login?next=%2Faccount%2Forders'),
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '订单加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, router, status]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function operate(order: OrderSummary, action: 'cancel' | 'confirm') {
    const confirmed = window.confirm(
      action === 'cancel'
        ? '确认取消订单？已预扣的库存和折扣码占用将立即释放。'
        : '确认已经收到商品？确认后订单将完成。',
    );
    if (!confirmed) return;
    setBusy(order.orderNo);
    setError('');
    try {
      await apiRequest(
        `/api/orders/${order.orderNo}/${action}`,
        {
          method: 'POST',
        },
        () => router.replace('/auth/login?next=%2Faccount%2Forders'),
      );
      setNotice(action === 'cancel' ? '订单已取消' : '已确认收货');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusy('');
    }
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 10));

  return (
    <div>
      {notice ? (
        <div className="bg-store-ink fixed top-24 right-5 z-[60] rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto border-b border-stone-900/8 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              status === tab.value
                ? 'bg-store-ink text-white'
                : 'bg-white text-stone-600 hover:bg-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <CircleAlert className="size-4" /> {error}
        </div>
      ) : null}

      {loading && !result ? (
        <div className="grid min-h-80 place-items-center text-sm text-stone-400">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : result?.list.length ? (
        <div className="mt-5 space-y-4">
          {result.list.map((order) => (
            <article
              key={order.orderNo}
              className="overflow-hidden rounded-3xl border border-stone-900/8 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-900/6 bg-stone-50/70 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-sm font-semibold">订单 {order.orderNo}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
                <span className="bg-store-success-soft text-store-success-ink rounded-full px-3 py-1.5 text-xs font-semibold">
                  {order.statusText}
                </span>
              </div>
              <div className="divide-y divide-stone-900/6 px-5 sm:px-6">
                {order.items.slice(0, 3).map((item, index) => (
                  <div
                    key={`${item.productName}-${item.variantName}-${index}`}
                    className="flex items-center gap-4 py-4"
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-stone-100">
                      {item.imageUrl ? (
                        <div
                          role="img"
                          aria-label={item.productName}
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${JSON.stringify(item.imageUrl)})`,
                          }}
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-xs font-black text-stone-300">
                          3D
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {item.productName}
                      </p>
                      <p className="mt-1 truncate text-xs text-stone-500">
                        {item.variantName}
                      </p>
                    </div>
                    <span className="text-sm text-stone-500">
                      × {item.quantity}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <p className="text-sm text-stone-500">
                  合计{' '}
                  <span className="text-lg font-semibold text-stone-950">
                    ¥{order.payableAmount}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/account/orders/${order.orderNo}`}
                    className="inline-flex h-9 items-center rounded-full border border-stone-900/12 px-4 text-xs font-semibold"
                  >
                    查看详情
                  </Link>
                  {order.status === 'pending_payment' ? (
                    <>
                      <button
                        disabled={busy !== ''}
                        onClick={() => void operate(order, 'cancel')}
                        className="h-9 rounded-full border border-rose-200 px-4 text-xs font-semibold text-rose-700 disabled:opacity-40"
                      >
                        取消订单
                      </button>
                      <Link
                        href={`/checkout/pay/${order.orderNo}`}
                        className="bg-store-ink inline-flex h-9 items-center rounded-full px-4 text-xs font-semibold text-white"
                      >
                        去支付
                      </Link>
                    </>
                  ) : null}
                  {order.status === 'shipped' ? (
                    <button
                      disabled={busy !== ''}
                      onClick={() => void operate(order, 'confirm')}
                      className="bg-store-ink h-9 rounded-full px-4 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      确认收货
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid min-h-80 place-items-center rounded-3xl border border-dashed border-stone-900/12 text-center text-sm text-stone-400">
          <span>
            <PackageOpen className="mx-auto mb-3 size-8 opacity-50" />
            当前分类暂无订单
          </span>
        </div>
      )}

      {(result?.total ?? 0) > 0 ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-full border border-stone-900/10 bg-white p-2.5 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-stone-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-full border border-stone-900/10 bg-white p-2.5 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
