'use client';

import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Save,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface BomItem {
  material_id: string;
  material_name: string;
  grams: string;
  waste_rate: string;
  required_grams: string;
}

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  skuCode: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  bomSnapshot: BomItem[];
}

interface Payment {
  id: string;
  outTradeNo: string;
  provider: string;
  providerTxnId: string | null;
  amount: string;
  currency: string;
  status: string;
  needsManualReview: boolean;
  paidAt: string | null;
  createdAt: string;
}

interface Shipment {
  id: string;
  carrierName: string;
  carrierCode: string;
  trackingNo: string;
  shippedAt: string;
  remark: string | null;
}

interface Refund {
  id: string;
  outRefundNo: string;
  providerRefundId: string | null;
  amount: string;
  isFullRefund: boolean;
  restock: boolean;
  reason: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderDetail {
  id: string;
  orderNo: string;
  userEmail: string;
  userNickname: string | null;
  status: string;
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  refundableAmount: string;
  discountCode: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverProvince: string;
  receiverCity: string;
  receiverDistrict: string;
  receiverDetail: string;
  buyerRemark: string | null;
  adminRemark: string | null;
  reservedUntil: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments: Payment[];
  refunds: Refund[];
  shipments: Shipment[];
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

export function OrderDetailManager({
  orderId,
  permissions,
}: {
  orderId: string;
  permissions: {
    remark: boolean;
    ship: boolean;
    cancel: boolean;
    refund: boolean;
  };
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [carrierCode, setCarrierCode] = useState('sf');
  const [carrierName, setCarrierName] = useState('顺丰速运');
  const [trackingNo, setTrackingNo] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundRestock, setRefundRestock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await apiRequest<OrderDetail>(
        `/api/admin/orders/${orderId}`,
      );
      setOrder(detail);
      setAdminRemark(detail.adminRemark ?? '');
      setRefundAmount(detail.refundableAmount);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '订单详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveRemark(): Promise<void> {
    setBusy('remark');
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/remark`, {
        method: 'PATCH',
        body: JSON.stringify({ remark: adminRemark.trim() || null }),
      });
      setNotice('内部备注已保存');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '备注保存失败');
    } finally {
      setBusy('');
    }
  }

  async function ship(): Promise<void> {
    if (
      !window.confirm(`确认使用 ${carrierName} 发货？快递单号：${trackingNo}`)
    )
      return;
    setBusy('ship');
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/ship`, {
        method: 'POST',
        body: JSON.stringify({ carrierCode, carrierName, trackingNo }),
      });
      setNotice('订单已发货');
      setTrackingNo('');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '发货失败');
    } finally {
      setBusy('');
    }
  }

  async function cancelOrder(): Promise<void> {
    if (
      !window.confirm('确认取消该待支付订单？耗材预扣与折扣码占用将一并释放。')
    )
      return;
    setBusy('cancel');
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/cancel`, {
        method: 'POST',
      });
      setNotice('订单已取消，相关占用已释放');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '取消失败');
    } finally {
      setBusy('');
    }
  }

  async function refundOrder(): Promise<void> {
    const restockMessage = refundRestock
      ? '；若为全额退款，将同时回补耗材库存'
      : '';
    if (
      !window.confirm(
        `确认退款 ¥${refundAmount}${restockMessage}？退款请求提交后不可撤销。`,
      )
    )
      return;
    setBusy('refund');
    setError('');
    try {
      await apiRequest(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: refundAmount,
          reason: refundReason.trim(),
          restock: refundRestock,
        }),
      });
      setNotice('退款成功');
      setRefundReason('');
      setRefundRestock(false);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '退款失败');
    } finally {
      setBusy('');
    }
  }

  if (loading && !order)
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-neutral-400">
        <span>
          <LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />
          加载订单详情
        </span>
      </div>
    );
  if (!order)
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <p className="rounded-2xl bg-rose-50 p-5 text-rose-700">
          {error || '订单不存在'}
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-black"
      >
        <ArrowLeft className="size-4" />
        返回订单列表
      </Link>
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            ORDER DETAIL
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {order.orderNo}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {formatDate(order.createdAt)} · {order.userNickname || '客户'}（
            {order.userEmail}）
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#151816] px-4 py-2 text-sm font-semibold text-white">
          {statusLabels[order.status] ?? order.status}
        </span>
      </div>
      {error ? (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <CircleAlert className="size-4" />
          {error}
        </div>
      ) : null}

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">商品与 BOM 快照</h2>
            <div className="mt-4 divide-y divide-black/6">
              {order.items.map((item) => (
                <div key={item.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {item.variantName} · SKU {item.skuCode}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      ¥{item.unitPrice} × {item.quantity}
                      <br />
                      <span className="text-neutral-400">
                        小计 ¥{item.subtotal}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs font-semibold text-neutral-500">
                      耗材需求快照
                    </p>
                    {item.bomSnapshot.map((bom) => (
                      <p
                        key={bom.material_id}
                        className="mt-1.5 text-xs text-neutral-600"
                      >
                        {bom.material_name}：{bom.required_grams}g / 件（基础{' '}
                        {bom.grams}g，损耗率 {Number(bom.waste_rate) * 100}%）
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">支付记录</h2>
            {order.payments.length ? (
              <div className="mt-4 space-y-3">
                {order.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-xl bg-neutral-50 p-4 text-sm"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">
                        {payment.provider} · {payment.status}
                      </span>
                      <span>¥{payment.amount}</span>
                    </div>
                    <p className="mt-2 text-xs break-all text-neutral-500">
                      交易号 {payment.outTradeNo}
                      {payment.providerTxnId
                        ? ` / ${payment.providerTxnId}`
                        : ''}
                    </p>
                    {payment.needsManualReview ? (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        需要人工复核
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-400">
                暂无支付记录（支付阶段暂未接入）
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">退款记录</h2>
            {order.refunds.length ? (
              <div className="mt-4 space-y-3">
                {order.refunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="rounded-xl bg-neutral-50 p-4 text-sm"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">
                        {refund.isFullRefund ? '全额退款' : '部分退款'} ·{' '}
                        {refund.status}
                      </span>
                      <span>¥{refund.amount}</span>
                    </div>
                    <p className="mt-2 text-xs break-all text-neutral-500">
                      退款单号 {refund.outRefundNo}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {refund.reason || '未填写原因'} ·{' '}
                      {refund.restock ? '已回补库存' : '未回补库存'} ·{' '}
                      {formatDate(refund.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-400">暂无退款记录</p>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">金额明细</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">商品小计</dt>
                <dd>¥{order.itemsAmount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">优惠</dt>
                <dd>-¥{order.discountAmount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">运费</dt>
                <dd>¥{order.shippingAmount}</dd>
              </div>
              <div className="flex justify-between border-t border-black/6 pt-3 text-base font-semibold">
                <dt>应付合计</dt>
                <dd>¥{order.payableAmount}</dd>
              </div>
              <div className="flex justify-between text-xs text-neutral-500">
                <dt>实付 / 已退款</dt>
                <dd>
                  ¥{order.paidAmount} / ¥{order.refundedAmount}
                </dd>
              </div>
              {order.discountCode ? (
                <div className="flex justify-between text-xs text-neutral-500">
                  <dt>折扣码</dt>
                  <dd>{order.discountCode}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">收货信息</h2>
            <p className="mt-4 text-sm font-medium">
              {order.receiverName} · {order.receiverPhone}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              {order.receiverProvince}
              {order.receiverCity}
              {order.receiverDistrict}
              {order.receiverDetail}
            </p>
            {order.shipments.map((shipment) => (
              <div
                key={shipment.id}
                className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800"
              >
                <p className="font-medium">
                  {shipment.carrierName} · {shipment.trackingNo}
                </p>
                <p className="mt-1 text-xs opacity-70">
                  {formatDate(shipment.shippedAt)}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">订单备注</h2>
            <p className="mt-3 text-xs text-neutral-500">买家备注</p>
            <p className="mt-1 text-sm">{order.buyerRemark || '无'}</p>
            <label className="mt-4 block text-xs text-neutral-500">
              内部备注（仅后台可见）
            </label>
            <textarea
              disabled={!permissions.remark}
              value={adminRemark}
              onChange={(event) => setAdminRemark(event.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-black/8 p-3 text-sm outline-none disabled:bg-neutral-50"
            />
            {permissions.remark ? (
              <button
                disabled={busy !== ''}
                onClick={() => void saveRemark()}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[#151816] px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Save className="size-3.5" />
                保存备注
              </button>
            ) : null}
          </section>

          {order.status === 'pending_shipment' && permissions.ship ? (
            <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <h2 className="flex items-center gap-2 font-semibold text-orange-900">
                <Truck className="size-4" />
                订单发货
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <input
                  value={carrierCode}
                  onChange={(e) => setCarrierCode(e.target.value)}
                  placeholder="快递代码"
                  className="h-10 rounded-xl border border-orange-200 bg-white px-3 text-sm"
                />
                <input
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  placeholder="快递公司"
                  className="h-10 rounded-xl border border-orange-200 bg-white px-3 text-sm"
                />
              </div>
              <input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="快递单号"
                className="mt-2 h-10 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm"
              />
              <button
                disabled={
                  busy !== '' ||
                  !carrierCode.trim() ||
                  !carrierName.trim() ||
                  !trackingNo.trim()
                }
                onClick={() => void ship()}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-semibold text-white disabled:opacity-50"
              >
                <PackageCheck className="size-4" />
                确认发货
              </button>
            </section>
          ) : null}

          {order.status === 'pending_payment' && permissions.cancel ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <h2 className="font-semibold text-rose-900">取消待支付订单</h2>
              <p className="mt-2 text-xs leading-5 text-rose-700">
                取消会原子释放耗材预扣和折扣码使用次数，操作不可撤销。
              </p>
              <button
                disabled={busy !== ''}
                onClick={() => void cancelOrder()}
                className="mt-3 h-10 w-full rounded-xl border border-rose-300 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                确认取消订单
              </button>
            </section>
          ) : null}

          {permissions.refund &&
          order.refundableAmount !== '0.00' &&
          !['pending_payment', 'cancelled', 'refunding'].includes(
            order.status,
          ) ? (
            <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
              <h2 className="flex items-center gap-2 font-semibold text-indigo-950">
                <RotateCcw className="size-4" />
                订单退款
              </h2>
              <p className="mt-2 text-xs leading-5 text-indigo-700">
                当前最多可退 ¥{order.refundableAmount}。部分退款不会回补库存，
                也不会释放折扣码；只有一次性退回应付总额才视为全额退款。
              </p>
              <label className="mt-4 block text-xs font-medium text-indigo-900">
                退款金额
              </label>
              <input
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                inputMode="decimal"
                placeholder={order.refundableAmount}
                className="mt-2 h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm"
              />
              <label className="mt-3 block text-xs font-medium text-indigo-900">
                退款原因
              </label>
              <textarea
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                maxLength={200}
                rows={3}
                placeholder="请填写退款原因"
                className="mt-2 w-full resize-none rounded-xl border border-indigo-200 bg-white p-3 text-sm"
              />
              <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-indigo-800">
                <input
                  type="checkbox"
                  checked={refundRestock}
                  onChange={(event) => setRefundRestock(event.target.checked)}
                  className="mt-1"
                />
                全额退款成功后回补该订单消耗的耗材库存（部分退款勾选无效）
              </label>
              <button
                disabled={
                  busy !== '' || !refundAmount.trim() || !refundReason.trim()
                }
                onClick={() => void refundOrder()}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 text-sm font-semibold text-white disabled:opacity-50"
              >
                <RotateCcw className="size-4" />
                确认退款
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
