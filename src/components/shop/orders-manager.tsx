'use client';

import { zhCN } from '@/messages/zh-CN';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  PackageOpen,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductDevice } from '@/lib/product-devices';
import { DeviceFit } from './device-fit';
import {
  orderListHref,
  parseOrderListQuery,
} from '@/lib/order-list-navigation';

import { customerOrderStatusLabels } from '@/messages/zh-CN';

interface OrderItemSummary {
  deviceModels?: ProductDevice[];
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
  latestReturn: { requestNo: string; status: string } | null;
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
  {
    value: 'pending_payment',
    label: customerOrderStatusLabels.pending_payment,
  },
  { value: 'in_production', label: customerOrderStatusLabels.in_production },
  { value: 'shipped', label: customerOrderStatusLabels.shipped },
  { value: 'completed', label: customerOrderStatusLabels.completed },
  {
    value: 'cancelled',
    label: `${customerOrderStatusLabels.cancelled}/${customerOrderStatusLabels.refunded}`,
  },
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
  const searchParams = useSearchParams();
  const { status, page } = parseOrderListQuery(searchParams);
  const listHref = orderListHref(status, page);
  const [result, setResult] = useState<OrderListResult | null>(null);
  const [resultKey, setResultKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const locks = useRef(new Set<string>());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<
    Record<string, { text: string; action?: 'cancel' | 'confirm' }>
  >({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        pageSize: '10',
      });
      const next = await apiRequest<OrderListResult>(
        `/api/orders?${params}`,
        undefined,
        () =>
          router.replace(`/auth/login?next=${encodeURIComponent(listHref)}`),
      );
      if (version === loadVersion.current) {
        const pages = Math.max(1, Math.ceil(next.total / 10));
        if (page > pages) {
          router.replace(orderListHref(status, pages), { scroll: false });
          return;
        }
        setResult(next);
        setResultKey(listHref);
      }
    } catch (caught: unknown) {
      if (version === loadVersion.current)
        setError(caught instanceof Error ? caught.message : '订单加载失败');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [page, router, status, listHref]);
  const reloadRef = useRef(load);
  useEffect(() => {
    reloadRef.current = load;
  }, [load]);

  useEffect(() => {
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function operate(order: OrderSummary, action: 'cancel' | 'confirm') {
    if (locks.current.has(order.orderNo)) return;
    const confirmed = window.confirm(
      action === 'cancel'
        ? '确认取消订单？已预扣的库存和折扣码占用将立即释放。'
        : '确认已经收到商品？确认后订单将完成。',
    );
    if (!confirmed) return;
    locks.current.add(order.orderNo);
    setBusy(new Set(locks.current));
    setFeedback((current) => ({
      ...current,
      [order.orderNo]: { text: '正在处理…' },
    }));
    try {
      await apiRequest(
        `/api/orders/${order.orderNo}/${action}`,
        {
          method: 'POST',
        },
        () =>
          router.replace(`/auth/login?next=${encodeURIComponent(listHref)}`),
      );
      const text = action === 'cancel' ? '订单已取消' : '已确认收货';
      setFeedback((current) => ({ ...current, [order.orderNo]: { text } }));
      setNotice(`订单 ${order.orderNo}：${text}`);
      // Do not offer an already completed action if the following reload fails.
      setResult((current) =>
        current
          ? {
              ...current,
              list: current.list.map((item) =>
                item.orderNo === order.orderNo
                  ? {
                      ...item,
                      status: action === 'cancel' ? 'cancelled' : 'completed',
                      statusText: action === 'cancel' ? '已取消' : '已完成',
                    }
                  : item,
              ),
            }
          : current,
      );
      await reloadRef.current();
    } catch (caught: unknown) {
      setFeedback((current) => ({
        ...current,
        [order.orderNo]: {
          text: caught instanceof Error ? caught.message : '操作失败',
          action,
        },
      }));
    } finally {
      locks.current.delete(order.orderNo);
      setBusy(new Set(locks.current));
    }
  }

  const visibleResult = resultKey === listHref ? result : null;
  const totalPages = Math.max(1, Math.ceil((visibleResult?.total ?? 0) / 10));

  return (
    <div aria-busy={loading}>
      {notice ? (
        <div
          role="status"
          className="bg-store-ink mb-4 rounded-lg px-5 py-3 text-sm font-medium text-white"
        >
          {notice}
        </div>
      ) : null}
      <div
        aria-label="订单状态筛选"
        className="flex gap-2 overflow-x-auto border-b border-stone-900/8 pb-3"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={status === tab.value}
            onClick={() => {
              router.push(orderListHref(tab.value, 1), { scroll: false });
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
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <CircleAlert className="size-4" /> {error}
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 underline"
          >
            重新加载订单
          </button>
        </div>
      ) : null}
      {loading && visibleResult ? (
        <p role="status" className="mt-3 text-sm text-stone-600">
          正在更新订单…
        </p>
      ) : null}

      {(loading || resultKey !== listHref) && !visibleResult && !error ? (
        <div className="grid min-h-80 place-items-center text-sm text-stone-400">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      ) : visibleResult?.list.length ? (
        <div className="mt-5 space-y-4">
          {visibleResult.list.map((order) => (
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
                <div className="flex flex-wrap items-center gap-2">
                  {order.latestReturn ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                      售后{' '}
                      {zhCN.returnStatus[order.latestReturn.status] ?? '处理中'}
                    </span>
                  ) : null}
                  <span className="bg-store-success-soft text-store-success-ink rounded-full px-3 py-1.5 text-xs font-semibold">
                    {order.statusText}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-stone-900/6 px-5 sm:px-6">
                {(expanded.has(order.orderNo)
                  ? order.items
                  : order.items.slice(0, 2)
                ).map((item, index) => (
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
                      <DeviceFit devices={item.deviceModels} current />
                    </div>
                    <span className="text-sm text-stone-500">
                      × {item.quantity}
                    </span>
                  </div>
                ))}
                {order.items.length > 2 ? (
                  <button
                    type="button"
                    aria-expanded={expanded.has(order.orderNo)}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(order.orderNo)) next.delete(order.orderNo);
                        else next.add(order.orderNo);
                        return next;
                      })
                    }
                    className="min-h-11 text-sm font-medium text-stone-600 underline"
                  >
                    {expanded.has(order.orderNo)
                      ? '收起商品'
                      : `展开全部 ${order.items.length} 款商品`}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <p className="w-full text-sm text-stone-600">
                  {order.latestReturn?.status === 'pending'
                    ? '售后审核中，可进入订单详情查看进度。'
                    : order.status === 'pending_payment'
                      ? order.reservedUntil
                        ? `请在 ${formatDate(order.reservedUntil)} 前完成支付。`
                        : '请在订单保留时间内完成支付。'
                      : order.status === 'shipped'
                        ? '商品已发出，可查看物流；收到后请确认收货。'
                        : [
                              'paid',
                              'in_production',
                              'pending_shipment',
                            ].includes(order.status)
                          ? '正在安排制作与发货，进度会在订单详情更新。'
                          : '查看订单详情可了解交付及售后记录。'}
                </p>
                <div className="w-full text-sm text-stone-500">
                  {order.status === 'pending_payment'
                    ? '待支付'
                    : Number(order.paidAmount) > 0
                      ? '实付'
                      : '订单金额'}{' '}
                  <span className="text-lg font-semibold text-stone-950">
                    ¥
                    {order.status !== 'pending_payment' &&
                    Number(order.paidAmount) > 0
                      ? order.paidAmount
                      : order.payableAmount}
                  </span>
                  {Number(order.refundedAmount) > 0 ? (
                    <span className="ml-4 inline-block">
                      已退款{' '}
                      <span className="font-semibold text-stone-700">
                        ¥{order.refundedAmount}
                      </span>
                    </span>
                  ) : null}
                </div>
                {feedback[order.orderNo] ? (
                  <div
                    role={feedback[order.orderNo].action ? 'alert' : 'status'}
                    className={`w-full rounded-lg p-3 text-sm ${feedback[order.orderNo].action ? 'bg-rose-50 text-rose-700' : 'bg-stone-50 text-stone-600'}`}
                  >
                    {feedback[order.orderNo].text}
                    {feedback[order.orderNo].action ? (
                      <button
                        type="button"
                        disabled={busy.has(order.orderNo)}
                        onClick={() =>
                          void operate(order, feedback[order.orderNo].action!)
                        }
                        className="ml-3 underline"
                      >
                        重试此操作
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="ml-auto flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                  <Link
                    href={`/account/orders/${order.orderNo}?from=${encodeURIComponent(listHref)}`}
                    className={`inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition ${['pending_payment', 'shipped'].includes(order.status) ? 'border-stone-900/12 hover:bg-stone-50' : 'bg-store-ink border-transparent text-white hover:opacity-90'}`}
                  >
                    查看详情
                  </Link>
                  {order.status === 'pending_payment' ? (
                    <>
                      <button
                        disabled={busy.has(order.orderNo)}
                        onClick={() => void operate(order, 'cancel')}
                        className="inline-flex h-11 items-center justify-center rounded-lg border border-stone-900/12 px-4 text-sm font-semibold text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                      >
                        {busy.has(order.orderNo) ? '处理中…' : '取消订单'}
                      </button>
                      <Link
                        aria-disabled={busy.has(order.orderNo)}
                        tabIndex={busy.has(order.orderNo) ? -1 : undefined}
                        onClick={(event) => {
                          if (busy.has(order.orderNo)) event.preventDefault();
                        }}
                        href={`/checkout/pay/${order.orderNo}`}
                        className="bg-store-ink inline-flex h-11 items-center justify-center rounded-lg border border-transparent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        去支付
                      </Link>
                    </>
                  ) : null}
                  {order.status === 'shipped' ? (
                    <button
                      disabled={busy.has(order.orderNo)}
                      onClick={() => void operate(order, 'confirm')}
                      className="bg-store-ink inline-flex h-11 items-center justify-center rounded-lg border border-transparent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      {busy.has(order.orderNo) ? '处理中…' : '确认收货'}
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

      {(visibleResult?.total ?? 0) > 0 ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            aria-label="上一页订单"
            disabled={page <= 1}
            onClick={() =>
              router.push(orderListHref(status, page - 1), { scroll: false })
            }
            className="rounded-full border border-stone-900/10 bg-white p-2.5 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-stone-500">
            {page} / {totalPages}
          </span>
          <button
            aria-label="下一页订单"
            disabled={page >= totalPages}
            onClick={() =>
              router.push(orderListHref(status, page + 1), { scroll: false })
            }
            className="rounded-full border border-stone-900/10 bg-white p-2.5 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
