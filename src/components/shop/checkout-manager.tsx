'use client';

import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  PackageCheck,
  TicketPercent,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  CHECKOUT_STORAGE_KEY,
  type CheckoutSelection,
} from '@/lib/checkout-storage';

interface Address {
  id: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

interface CartItem {
  id: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
}

interface Preview {
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  payableAmount: string;
  discount: { code: string; name: string; type: string } | null;
  unavailableItems: Array<{
    variantId: string;
    requestedQty: number;
    availableQty: number;
    reason: string;
  }>;
}

interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

interface CreatedOrder {
  orderNo: string;
  payableAmount: string;
  reservedUntil: string;
}

function readSelection(): CheckoutSelection | null {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY) ?? 'null',
    ) as CheckoutSelection | null;
    if (
      !parsed ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0 ||
      parsed.items.some(
        (item) =>
          typeof item.variantId !== 'string' ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 99,
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function CheckoutManager() {
  const [selection, setSelection] = useState<CheckoutSelection | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>('');
  const [discountInput, setDiscountInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [buyerRemark, setBuyerRemark] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const authResponse = await fetch('/api/auth/me', {
          cache: 'no-store',
        });
        if (authResponse.status === 401) {
          window.location.assign('/auth/login?next=%2Fcheckout');
          return;
        }
        if (!authResponse.ok) throw new Error('登录状态校验失败');

        const storedSelection = readSelection();
        if (!storedSelection) {
          setMessage('没有可结算的商品，请返回购物车重新选择');
          return;
        }
        setSelection(storedSelection);
        const [cartResponse, addressResponse] = await Promise.all([
          fetch('/api/cart', { cache: 'no-store' }),
          fetch('/api/addresses', { cache: 'no-store' }),
        ]);
        const cartBody = (await cartResponse.json()) as ApiResponse<{
          items: CartItem[];
        }>;
        const addressBody = (await addressResponse.json()) as ApiResponse<{
          addresses: Address[];
        }>;
        if (!cartResponse.ok || !cartBody.data)
          throw new Error(cartBody.message);
        if (!addressResponse.ok || !addressBody.data)
          throw new Error(addressBody.message);
        setCartItems(cartBody.data.items);
        setAddresses(addressBody.data.addresses);
        setAddressId(
          addressBody.data.addresses.find((item) => item.isDefault)?.id ??
            addressBody.data.addresses[0]?.id ??
            '',
        );
      } catch (error: unknown) {
        setMessage(error instanceof Error ? error.message : '结算信息加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const requestPreview = useCallback(
    async (
      code: string | null,
      selectedAddressId: string,
    ): Promise<Preview> => {
      if (!selection) throw new Error('没有可结算的商品');
      const response = await fetch('/api/orders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selection.items,
          addressId: selectedAddressId || null,
          discountCode: code,
        }),
      });
      const body = (await response.json()) as ApiResponse<Preview>;
      if (response.status === 401) {
        window.location.assign('/auth/login?next=%2Fcheckout');
        throw new Error('请先登录');
      }
      if (!response.ok || !body.data) throw new Error(body.message);
      return body.data;
    },
    [selection],
  );

  useEffect(() => {
    if (!selection || loading) return;
    let active = true;
    setPreviewing(true);
    void requestPreview(appliedCode, addressId)
      .then((result) => {
        if (active) {
          setPreview(result);
          setMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(error instanceof Error ? error.message : '订单试算失败');
      })
      .finally(() => {
        if (active) setPreviewing(false);
      });
    return () => {
      active = false;
    };
  }, [addressId, appliedCode, loading, requestPreview, selection]);

  const selectedCartItems = useMemo(() => {
    if (!selection) return [];
    const cartByVariant = new Map(
      cartItems.map((item) => [item.variantId, item]),
    );
    const displayByVariant = new Map(
      (selection.displayItems ?? []).map((item) => [item.variantId, item]),
    );
    return selection.items.flatMap((selected) => {
      const cartItem =
        cartByVariant.get(selected.variantId) ??
        displayByVariant.get(selected.variantId);
      return cartItem ? [{ ...cartItem, quantity: selected.quantity }] : [];
    });
  }, [cartItems, selection]);
  const missingItemCount =
    (selection?.items.length ?? 0) - selectedCartItems.length;
  const hasUnavailableItems =
    missingItemCount > 0 || (preview?.unavailableItems.length ?? 0) > 0;

  async function applyDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setPreviewing(true);
    setMessage(null);
    try {
      const result = await requestPreview(code, addressId);
      setPreview(result);
      setAppliedCode(code);
      setDiscountInput(code);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '折扣码不可用');
    } finally {
      setPreviewing(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!selection || !addressId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selection.items,
          addressId,
          discountCode: appliedCode,
          buyerRemark: buyerRemark.trim() || null,
          fromCart: selection.fromCart,
        }),
      });
      const body = (await response.json()) as ApiResponse<CreatedOrder>;
      if (!response.ok || !body.data) throw new Error(body.message);
      window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      setCreatedOrder(body.data);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '订单提交失败');
      try {
        setPreview(await requestPreview(appliedCode, addressId));
      } catch {
        // 保留原始提交错误，用户可修改后重试。
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (createdOrder) {
    return (
      <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 text-center shadow-sm sm:p-12">
        <CheckCircle2 className="mx-auto size-14 text-[#3d6247]" />
        <h2 className="mt-5 text-3xl font-semibold">订单创建成功</h2>
        <p className="mt-3 text-sm text-stone-500">
          订单号：{createdOrder.orderNo}
        </p>
        <p className="mt-7 text-sm text-stone-500">待支付金额</p>
        <p className="mt-1 text-4xl font-semibold">
          ¥{createdOrder.payableAmount}
        </p>
        <div className="mt-7 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          支付功能暂未接入。订单库存将保留至{' '}
          {new Date(createdOrder.reservedUntil).toLocaleString('zh-CN')}。
        </div>
        <Link
          href="/products"
          className="mt-8 inline-flex h-11 items-center rounded-full bg-[#17251c] px-6 text-sm font-bold text-white"
        >
          继续浏览作品
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="py-24 text-center text-sm text-stone-500">
        正在准备结算信息…
      </p>
    );
  }

  if (!selection) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-900/15 py-16 text-center">
        <AlertTriangle className="mx-auto size-10 text-stone-300" />
        <p className="mt-4 font-semibold">{message ?? '没有可结算的商品'}</p>
        <Link
          href="/cart"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-[#17251c] px-6 text-sm font-bold text-white"
        >
          返回购物车
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_23rem]">
      <div className="space-y-6">
        {message ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </p>
        ) : null}

        <section className="rounded-3xl border border-stone-900/8 bg-white/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <MapPin className="size-5" />
              收货地址
            </h2>
            <Link
              href="/account/addresses"
              className="text-xs font-semibold text-[#3d6247] hover:underline"
            >
              新增或管理地址
            </Link>
          </div>
          {addresses.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              请先新增收货地址后再提交订单。
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {addresses.map((address) => (
                <label
                  key={address.id}
                  className={`cursor-pointer rounded-2xl border p-4 text-sm ${addressId === address.id ? 'border-[#3d6247] bg-[#e8ecdf]/70' : 'border-stone-900/8'}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="address"
                      value={address.id}
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                      className="accent-[#17251c]"
                    />
                    {address.receiverName} · {address.receiverPhone}
                  </span>
                  <span className="mt-2 block leading-6 text-stone-500">
                    {address.province} {address.city} {address.district}{' '}
                    {address.detail}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-stone-900/8 bg-white/70 p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <PackageCheck className="size-5" />
            商品清单
          </h2>
          <div className="mt-5 divide-y divide-stone-900/8">
            {selectedCartItems.map((item) => (
              <div
                key={item.variantId}
                className="flex gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-stone-200">
                  {item.imageUrl ? (
                    <span
                      role="img"
                      aria-label={item.productName}
                      className="block size-full bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${JSON.stringify(item.imageUrl)})`,
                      }}
                    />
                  ) : (
                    <span className="grid size-full place-items-center font-black text-stone-900/10">
                      3D
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="font-semibold hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <p className="mt-1 text-xs text-stone-500">
                    {item.variantName}
                  </p>
                  <p className="mt-3 text-sm">
                    ¥{item.unitPrice} × {item.quantity}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {hasUnavailableItems ? (
            <p className="mt-5 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <AlertTriangle className="size-4" />
              部分商品已失效或库存不足，请返回购物车调整。
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-stone-900/8 bg-white/70 p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <TicketPercent className="size-5" />
            折扣与备注
          </h2>
          <form onSubmit={applyDiscount} className="mt-5 flex gap-2">
            <input
              maxLength={32}
              value={discountInput}
              disabled={Boolean(appliedCode)}
              onChange={(event) =>
                setDiscountInput(event.target.value.toUpperCase())
              }
              placeholder="输入折扣码"
              className="h-11 min-w-0 flex-1 rounded-full border border-stone-900/10 bg-white px-4 text-sm outline-none focus:border-stone-900/30"
            />
            <button
              disabled={previewing || Boolean(appliedCode)}
              className="h-11 rounded-full border border-[#17251c] px-5 text-sm font-bold disabled:opacity-40"
            >
              使用
            </button>
            {appliedCode ? (
              <button
                type="button"
                onClick={() => {
                  setAppliedCode(null);
                  setDiscountInput('');
                }}
                className="h-11 rounded-full px-3 text-xs font-semibold text-red-600"
              >
                取消
              </button>
            ) : null}
          </form>
          {preview?.discount ? (
            <p className="mt-3 text-sm font-semibold text-[#3d6247]">
              已使用：{preview.discount.name}（{preview.discount.code}）
            </p>
          ) : null}
          <label className="mt-6 block text-sm font-semibold">
            买家备注（选填）
            <textarea
              maxLength={200}
              rows={3}
              value={buyerRemark}
              onChange={(event) => setBuyerRemark(event.target.value)}
              placeholder="例如：希望使用环保包装"
              className="mt-2 w-full rounded-2xl border border-stone-900/10 bg-white p-4 text-sm font-normal outline-none focus:border-stone-900/30"
            />
            <span className="mt-1 block text-right text-xs font-normal text-stone-400">
              {buyerRemark.length}/200
            </span>
          </label>
        </section>
      </div>

      <aside className="h-fit rounded-3xl bg-[#17251c] p-6 text-white lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold">金额明细</h2>
        <dl className="mt-6 space-y-4 border-b border-white/10 pb-6 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/60">商品小计</dt>
            <dd>¥{preview?.itemsAmount ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">优惠</dt>
            <dd className="text-[#d9ff68]">
              -¥{preview?.discountAmount ?? '0.00'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">运费</dt>
            <dd>
              {addressId
                ? `¥${preview?.shippingAmount ?? '--'}`
                : '选择地址后计算'}
            </dd>
          </div>
        </dl>
        <div className="flex items-end justify-between py-6">
          <span className="text-sm text-white/60">应付合计</span>
          <strong className="text-3xl">
            ¥{preview?.payableAmount ?? '--'}
          </strong>
        </div>
        <button
          type="button"
          disabled={
            !addressId ||
            !preview ||
            previewing ||
            hasUnavailableItems ||
            submitting
          }
          onClick={() => void submitOrder()}
          className="h-12 w-full rounded-full bg-[#d9ff68] text-sm font-bold text-[#17251c] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          {submitting ? '提交中…' : '提交订单'}
        </button>
        <p className="mt-3 text-center text-xs text-white/45">
          提交时将再次校验库存、价格和折扣码
        </p>
      </aside>
    </div>
  );
}
