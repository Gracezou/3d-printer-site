'use client';

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Printer,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  printStatus: string | null;
  printStatusText: string | null;
  printerName: string | null;
}

interface OrderDetailData {
  orderNo: string;
  status: string;
  statusText: string;
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  discountCode: string | null;
  buyerRemark: string | null;
  reservedUntil: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  receiver: { name: string; phone: string; address: string };
  items: OrderItem[];
  shipment: {
    carrierName: string;
    trackingNo: string;
    shippedAt: string;
  } | null;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const stages = [
  { label: '下单', icon: Clock3 },
  { label: '支付', icon: Check },
  { label: '生产', icon: Printer },
  { label: '发货', icon: Truck },
  { label: '完成', icon: PackageCheck },
] as const;

function activeStage(status: string): number {
  if (status === 'pending_payment') return 0;
  if (['paid', 'in_production', 'pending_shipment'].includes(status)) return 2;
  if (status === 'shipped') return 3;
  if (status === 'completed') return 4;
  return 0;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
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

export function OrderDetail({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOrder(
        await apiRequest<OrderDetailData>(
          `/api/orders/${orderNo}`,
          undefined,
          () =>
            router.replace(
              `/auth/login?next=${encodeURIComponent(`/account/orders/${orderNo}`)}`,
            ),
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '订单加载失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo, router]);

  useEffect(() => void load(), [load]);
  const stage = useMemo(
    () => activeStage(order?.status ?? ''),
    [order?.status],
  );

  async function operate(action: 'cancel' | 'confirm') {
    if (
      !window.confirm(
        action === 'cancel'
          ? '确认取消订单并释放库存及折扣码占用？'
          : '确认已经收到商品？',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        `/api/orders/${orderNo}/${action}`,
        { method: 'POST' },
        () =>
          router.replace(
            `/auth/login?next=${encodeURIComponent(`/account/orders/${orderNo}`)}`,
          ),
      );
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order)
    return (
      <div className="grid min-h-[60vh] place-items-center text-stone-400">
        <LoaderCircle className="size-7 animate-spin" />
      </div>
    );
  if (!order)
    return (
      <div className="mx-auto max-w-4xl px-5 py-20">
        <p className="rounded-2xl bg-rose-50 p-5 text-rose-700">
          {error || '订单不存在'}
        </p>
      </div>
    );

  const terminated = ['cancelled', 'refunding', 'refunded'].includes(
    order.status,
  );

  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-950"
      >
        <ArrowLeft className="size-4" /> 返回订单列表
      </Link>
      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
            订单详情
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {order.orderNo}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <span className="bg-store-ink w-fit rounded-full px-4 py-2 text-sm font-semibold text-white">
          {order.statusText}
        </span>
      </div>

      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
          <CircleAlert className="size-4" /> {error}
        </div>
      ) : null}

      {terminated ? (
        <div className="mt-7 rounded-3xl bg-stone-200/70 p-6 text-center">
          <p className="text-lg font-semibold">订单流程已终止</p>
          <p className="mt-2 text-sm text-stone-500">
            当前状态：{order.statusText}
          </p>
        </div>
      ) : (
        <section className="mt-7 rounded-3xl border border-stone-900/8 bg-white p-6 sm:p-8">
          <div className="grid grid-cols-5">
            {stages.map((item, index) => {
              const Icon = item.icon;
              const active = index <= stage;
              return (
                <div key={item.label} className="relative text-center">
                  {index > 0 ? (
                    <span
                      className={`absolute top-5 right-1/2 h-0.5 w-full ${index <= stage ? 'bg-store-success-mid' : 'bg-stone-200'}`}
                    />
                  ) : null}
                  <span
                    className={`relative mx-auto grid size-10 place-items-center rounded-full ${active ? 'bg-store-ink text-white' : 'bg-stone-100 text-stone-400'}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <p
                    className={`mt-2 text-xs ${active ? 'font-semibold' : 'text-stone-400'}`}
                  >
                    {item.label}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-stone-900/8 bg-white p-6">
            <h2 className="text-lg font-semibold">商品与生产进度</h2>
            <div className="mt-4 divide-y divide-stone-900/6">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-stone-100">
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
                      <span className="grid h-full place-items-center text-sm font-black text-stone-300">
                        3D
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.productName}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {item.variantName} × {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium">
                        ¥{item.subtotal}
                      </p>
                    </div>
                    {item.printStatusText ? (
                      <div className="bg-store-success-pale text-store-leaf mt-3 rounded-xl px-3 py-2 text-xs font-medium">
                        生产状态：{item.printStatusText}
                        {item.printerName ? ` · ${item.printerName}` : ''}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {order.shipment ? (
            <section className="rounded-3xl border border-stone-900/8 bg-white p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Truck className="size-5" />
                物流信息
              </h2>
              <p className="mt-4 font-medium">{order.shipment.carrierName}</p>
              <p className="mt-1 text-sm text-stone-500">
                快递单号：{order.shipment.trackingNo}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {formatDate(order.shipment.shippedAt)}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-stone-900/8 bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="size-5" />
              收货信息
            </h2>
            <p className="mt-4 text-sm font-medium">
              {order.receiver.name} · {order.receiver.phone}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {order.receiver.address}
            </p>
          </section>
          <section className="rounded-3xl border border-stone-900/8 bg-white p-6">
            <h2 className="text-lg font-semibold">金额明细</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">商品小计</dt>
                <dd>¥{order.itemsAmount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">优惠</dt>
                <dd>-¥{order.discountAmount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">运费</dt>
                <dd>¥{order.shippingAmount}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-900/8 pt-3 text-base font-semibold">
                <dt>应付合计</dt>
                <dd>¥{order.payableAmount}</dd>
              </div>
              {order.refundedAmount !== '0.00' ? (
                <div className="flex justify-between text-xs text-rose-600">
                  <dt>已退款</dt>
                  <dd>¥{order.refundedAmount}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          {order.buyerRemark ? (
            <section className="rounded-3xl bg-stone-100 p-5 text-sm">
              <p className="font-semibold">买家备注</p>
              <p className="mt-2 leading-6 text-stone-600">
                {order.buyerRemark}
              </p>
            </section>
          ) : null}
          {order.status === 'pending_payment' ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={busy}
                onClick={() => void operate('cancel')}
                className="h-11 rounded-full border border-rose-200 text-sm font-semibold text-rose-700 disabled:opacity-40"
              >
                取消订单
              </button>
              <Link
                href={`/checkout/pay/${order.orderNo}`}
                className="bg-store-ink inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold text-white"
              >
                去支付
              </Link>
            </div>
          ) : null}
          {order.status === 'shipped' ? (
            <button
              disabled={busy}
              onClick={() => void operate('confirm')}
              className="bg-store-ink h-11 w-full rounded-full text-sm font-semibold text-white disabled:opacity-40"
            >
              确认收货
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
