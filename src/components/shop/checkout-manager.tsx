'use client';

import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  PackageCheck,
  TicketPercent,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CHECKOUT_STORAGE_KEY,
  type CheckoutSelection,
} from '@/lib/checkout-storage';
import { zhCN } from '@/messages/zh-CN';
import type { ProductDevice } from '@/lib/product-devices';
import { DeviceFit } from './device-fit';

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
  deviceModels?: ProductDevice[];
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
  shipping: {
    ruleName: string;
    freeThreshold: string | null;
    reason: 'charged' | 'threshold' | 'discount_code';
  } | null;
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
  const router = useRouter();
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
  const submittingRef = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [previewKey, setPreviewKey] = useState('');
  const currentPreviewKey = JSON.stringify([
    selection?.items,
    addressId,
    appliedCode,
  ]);
  const previewIsCurrent = preview !== null && previewKey === currentPreviewKey;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoaded(false);
    void (async () => {
      try {
        const authResponse = await fetch('/api/auth/me', {
          cache: 'no-store',
        });
        if (authResponse.status === 401) {
          router.replace('/auth/login?next=%2Fcheckout');
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
        if (!active) return;
        setCartItems(cartBody.data.items);
        setAddresses(addressBody.data.addresses);
        setAddressId(
          addressBody.data.addresses.find((item) => item.isDefault)?.id ??
            addressBody.data.addresses[0]?.id ??
            '',
        );
        setLoaded(true);
      } catch (error: unknown) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : '结算信息加载失败',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAttempt, router]);

  const requestPreview = useCallback(
    async (
      code: string | null,
      selectedAddressId: string,
      signal?: AbortSignal,
    ): Promise<Preview> => {
      if (!selection) throw new Error('没有可结算的商品');
      const response = await fetch('/api/orders/preview', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selection.items,
          addressId: selectedAddressId || null,
          discountCode: code,
        }),
      });
      const body = (await response.json()) as ApiResponse<Preview>;
      if (response.status === 401) {
        router.replace('/auth/login?next=%2Fcheckout');
        throw new Error('请先登录');
      }
      if (!response.ok || !body.data) throw new Error(body.message);
      return body.data;
    },
    [router, selection],
  );

  useEffect(() => {
    if (!selection || loading || !loaded || createdOrder) return;
    let active = true;
    const controller = new AbortController();
    setPreviewing(true);
    void requestPreview(appliedCode, addressId, controller.signal)
      .then((result) => {
        if (active) {
          setPreview(result);
          setPreviewKey(currentPreviewKey);
          setMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPreview(null);
          setPreviewKey('');
          setMessage(error instanceof Error ? error.message : '订单试算失败');
        }
      })
      .finally(() => {
        if (active) setPreviewing(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    addressId,
    appliedCode,
    loading,
    loaded,
    requestPreview,
    selection,
    currentPreviewKey,
    previewAttempt,
    createdOrder,
  ]);

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

  function applyDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setAppliedCode(code);
    setDiscountInput(code);
  }

  async function submitOrder(): Promise<void> {
    if (
      !selection ||
      !addressId ||
      submittingRef.current ||
      !previewIsCurrent ||
      previewing ||
      hasUnavailableItems
    )
      return;
    submittingRef.current = true;
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
      setCreatedOrder(body.data);
      // An order already exists even if browser storage is unavailable.
      try {
        window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      } catch {
        /* no retry of a successful order */
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '订单提交失败');
      setPreview(null);
      setPreviewKey('');
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  if (createdOrder) {
    return (
      <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 text-center shadow-sm sm:p-12">
        <CheckCircle2 className="text-store-success mx-auto size-14" />
        <h2 className="mt-5 text-3xl font-semibold">订单创建成功</h2>
        <p className="mt-3 text-sm text-stone-500">
          订单号：{createdOrder.orderNo}
        </p>
        <p className="mt-7 text-sm text-stone-500">待支付金额</p>
        <p className="mt-1 text-4xl font-semibold">
          ¥{createdOrder.payableAmount}
        </p>
        <div className="mt-7 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          请在以下时间前完成支付，超时后订单库存将被释放：{' '}
          {new Date(createdOrder.reservedUntil).toLocaleString('zh-CN')}。
        </div>
        <Link
          href={`/checkout/pay/${createdOrder.orderNo}`}
          className="bg-store-ink mt-8 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold text-white"
        >
          去支付宝支付
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <p role="status" className="py-24 text-center text-sm text-stone-500">
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
          className="bg-store-ink mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold text-white"
        >
          返回购物车
        </Link>
      </div>
    );
  }

  if (!loaded)
    return (
      <div role="alert" className="store-panel space-y-4">
        <p>{message ?? '结算信息加载失败'}</p>
        <button
          className="store-button"
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          重新加载结算信息
        </button>
        <Link href="/cart" className="ml-4 underline">
          返回购物车
        </Link>
      </div>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_23rem]">
      <fieldset disabled={submitting} className="min-w-0 space-y-6">
        <legend className="sr-only">结算信息</legend>
        {message ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
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
              href="/account/addresses?next=%2Fcheckout"
              className="text-store-success text-xs font-semibold hover:underline"
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
                  className={`cursor-pointer rounded-2xl border p-4 text-sm ${addressId === address.id ? 'border-store-success bg-store-mist/70' : 'border-stone-900/8'}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="address"
                      value={address.id}
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                      className="accent-store-ink"
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
                  <DeviceFit devices={item.deviceModels} />
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
          <details className="mt-5" open={appliedCode ? true : undefined}>
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              有折扣码？
            </summary>
            <form onSubmit={applyDiscount} className="mt-3 flex gap-2">
              <input
                aria-label="折扣码"
                aria-describedby={
                  message ? 'checkout-preview-status' : undefined
                }
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
                className="border-store-ink h-11 rounded-full border px-5 text-sm font-bold disabled:opacity-40"
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
          </details>
          {preview?.discount ? (
            <p className="text-store-success mt-3 text-sm font-semibold">
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
      </fieldset>

      <aside
        aria-busy={previewing}
        className="bg-store-ink h-fit rounded-lg p-6 text-white lg:sticky lg:top-24"
      >
        <h2 className="text-xl font-semibold">金额明细</h2>
        <div
          id="checkout-preview-status"
          role="status"
          className="mt-3 text-sm text-white/80"
        >
          {previewing
            ? '正在更新金额与运费…'
            : previewIsCurrent
              ? '金额已更新'
              : '金额尚未确认，请重新试算后提交'}
          {!previewing && !previewIsCurrent ? (
            <button
              type="button"
              onClick={() => setPreviewAttempt((value) => value + 1)}
              className="mt-2 block min-h-11 underline"
            >
              重新试算
            </button>
          ) : null}
        </div>
        <dl className="mt-6 space-y-4 border-b border-white/10 pb-6 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/60">商品小计</dt>
            <dd>¥{preview?.itemsAmount ?? '--'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">优惠</dt>
            <dd className="text-store-accent">
              -¥{preview?.discountAmount ?? '0.00'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">{zhCN.commerce.shippingFee}</dt>
            <dd>
              {addressId
                ? `¥${preview?.shippingAmount ?? '--'}`
                : '选择地址后计算'}
            </dd>
          </div>
          {addressId && preview?.shipping ? (
            <p className="text-right text-xs leading-5 text-white/45">
              {preview.shipping.reason === 'threshold'
                ? zhCN.commerce.freeShippingThreshold(
                    preview.shipping.freeThreshold,
                  )
                : preview.shipping.reason === 'discount_code'
                  ? zhCN.commerce.freeShippingByCode
                  : `按“${preview.shipping.ruleName}”计算`}
            </p>
          ) : null}
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
            !previewIsCurrent ||
            previewing ||
            hasUnavailableItems ||
            submitting
          }
          onClick={() => void submitOrder()}
          className="bg-store-accent text-store-ink h-12 w-full rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
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
