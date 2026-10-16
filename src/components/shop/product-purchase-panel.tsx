'use client';

import {
  Check,
  Minus,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deviceLabel, type ProductDevice } from '@/lib/product-devices';

import { CHECKOUT_STORAGE_KEY } from '@/lib/checkout-storage';
import {
  productDimensionHints,
  productDimensionLabels,
} from '@/lib/display-labels';
import {
  optionHasStock,
  selectCompatibleAttributes,
} from '@/lib/product-selection';

import { dispatchCartUpdated } from './cart-indicator';

interface ProductVariant {
  id: string;
  skuCode: string;
  name: string;
  attributes: Record<string, string>;
  price: string;
  comparePrice: string | null;
  imageUrl: string | null;
}

interface AvailabilityResponse {
  code: number;
  data: { variants: Array<{ variantId: string; availableQty: number }> } | null;
  message: string;
}

interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

const PENDING_PURCHASE_KEY = 'pending-purchase';

interface ProductPurchasePanelProps {
  productName: string;
  slug: string;
  variants: ProductVariant[];
  deviceModels?: ProductDevice[];
  mainImageUrl?: string | null;
}

export function ProductPurchasePanel({
  productName,
  slug,
  variants,
  deviceModels = [],
  mainImageUrl,
}: ProductPurchasePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceId = searchParams.get('device');
  const selectedDevice = deviceModels.find((device) => device.id === deviceId);
  const incompatibleDevice = Boolean(deviceId && !selectedDevice);
  const purchaseLock = useRef(false);
  const initializedSelection = useRef(false);
  const [availability, setAvailability] = useState<Map<string, number> | null>(
    null,
  );
  const [availabilityError, setAvailabilityError] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<string, string>
  >({});
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const normalizedVariants = useMemo(
    () =>
      variants.map((variant) => ({
        ...variant,
        selection:
          Object.keys(variant.attributes).length > 0
            ? variant.attributes
            : { variant: variant.name },
      })),
    [variants],
  );
  const dimensions = useMemo(
    () => [
      ...new Set(
        normalizedVariants.flatMap((variant) => Object.keys(variant.selection)),
      ),
    ],
    [normalizedVariants],
  );

  const loadAvailability = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(slug)}/availability`,
        {
          cache: 'no-store',
        },
      );
      const body = (await response.json()) as AvailabilityResponse;
      if (!response.ok || body.code !== 0 || !body.data)
        throw new Error(body.message);
      setAvailability(
        new Map(
          body.data.variants.map((item) => [item.variantId, item.availableQty]),
        ),
      );
      setAvailabilityError(false);
    } catch {
      setAvailability(new Map());
      setAvailabilityError(true);
    }
  }, [slug]);

  useEffect(() => {
    void loadAvailability();
    const timer = window.setInterval(() => void loadAvailability(), 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadAvailability();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadAvailability]);

  useEffect(() => {
    if (
      !availability ||
      normalizedVariants.length !== 1 ||
      initializedSelection.current
    )
      return;
    const onlyVariant = normalizedVariants[0]!;
    if ((availability.get(onlyVariant.id) ?? 0) > 0) {
      setSelectedAttributes(onlyVariant.selection);
      initializedSelection.current = true;
    }
  }, [availability, normalizedVariants]);

  const selectedVariant = normalizedVariants.find((variant) =>
    dimensions.every(
      (dimension) =>
        variant.selection[dimension] === selectedAttributes[dimension],
    ),
  );
  const selectedAvailableQty = selectedVariant
    ? (availability?.get(selectedVariant.id) ?? 0)
    : 0;
  const displayVariant = selectedVariant ?? normalizedVariants[0];

  function optionIsAvailable(dimension: string, value: string): boolean {
    if (!availability) return false;
    return optionHasStock(normalizedVariants, availability, dimension, value);
  }

  function chooseOption(dimension: string, value: string): void {
    if (!availability) return;
    const next = selectCompatibleAttributes(
      normalizedVariants,
      availability,
      selectedAttributes,
      dimension,
      value,
    );
    const cleared = Object.keys(selectedAttributes).filter(
      (key) => key !== dimension && !next[key],
    );
    setSelectedAttributes(next);
    setQuantity(1);
    setNotice(
      cleared.length
        ? `原组合不存在或已售罄，已清除${cleared.map((key) => productDimensionLabels[key] ?? key).join('、')}，请重新选择。`
        : null,
    );
  }

  const purchasable = Boolean(
    selectedVariant &&
    selectedAvailableQty >= quantity &&
    quantity <= 99 &&
    !availabilityError &&
    !incompatibleDevice,
  );

  const submitCartItem = useCallback(
    async (variantId: string, itemQuantity: number) => {
      if (purchaseLock.current || incompatibleDevice) return;
      purchaseLock.current = true;
      setIsAdding(true);
      setNotice(null);
      try {
        const response = await fetch('/api/cart/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId, quantity: itemQuantity }),
        });
        const body = (await response.json()) as ApiResponse<{
          id: string;
          quantity: number;
          cartCount: number;
        }>;
        if (response.status === 401) {
          window.sessionStorage.setItem(
            PENDING_PURCHASE_KEY,
            JSON.stringify({
              slug,
              variantId,
              quantity: itemQuantity,
              mode: 'cart',
            }),
          );
          router.replace(
            `/auth/login?next=${encodeURIComponent(`/products/${slug}?resumePurchase=1${deviceId ? `&device=${encodeURIComponent(deviceId)}` : ''}`)}`,
          );
          return;
        }
        if (!response.ok || body.code !== 0) throw new Error(body.message);
        dispatchCartUpdated(body.data?.cartCount);
        setNotice(
          `已加入购物车，购物车内共 ${body.data?.quantity ?? itemQuantity} 件`,
        );
      } catch (error: unknown) {
        setNotice(
          error instanceof Error ? error.message : '加入购物车失败，请重试',
        );
        await loadAvailability();
      } finally {
        purchaseLock.current = false;
        setIsAdding(false);
      }
    },
    [loadAvailability, router, slug, deviceId, incompatibleDevice],
  );

  const startCheckout = useCallback(
    async (variantId: string, itemQuantity: number) => {
      if (purchaseLock.current || incompatibleDevice) return;
      purchaseLock.current = true;
      setIsAdding(true);
      setNotice(null);
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.status === 401) {
          window.sessionStorage.setItem(
            PENDING_PURCHASE_KEY,
            JSON.stringify({
              slug,
              variantId,
              quantity: itemQuantity,
              mode: 'checkout',
            }),
          );
          router.replace(
            `/auth/login?next=${encodeURIComponent(`/products/${slug}?resumePurchase=1${deviceId ? `&device=${encodeURIComponent(deviceId)}` : ''}`)}`,
          );
          return;
        }
        if (!response.ok) throw new Error('登录状态校验失败');
        window.sessionStorage.setItem(
          CHECKOUT_STORAGE_KEY,
          JSON.stringify({
            items: [{ variantId, quantity: itemQuantity }],
            fromCart: false,
            displayItems: variants
              .filter((variant) => variant.id === variantId)
              .map((variant) => ({
                variantId,
                productName,
                productSlug: slug,
                variantName: variant.name,
                imageUrl: variant.imageUrl ?? mainImageUrl ?? null,
                deviceModels,
                unitPrice: variant.price,
                quantity: itemQuantity,
              })),
          }),
        );
        router.push('/checkout');
      } catch (error: unknown) {
        setNotice(
          error instanceof Error ? error.message : '暂时无法结算，请重试',
        );
      } finally {
        purchaseLock.current = false;
        setIsAdding(false);
      }
    },
    [
      productName,
      router,
      slug,
      variants,
      deviceModels,
      deviceId,
      incompatibleDevice,
      mainImageUrl,
    ],
  );

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get('resumePurchase') !== '1'
    )
      return;
    const pendingValue = window.sessionStorage.getItem(PENDING_PURCHASE_KEY);
    if (!pendingValue) return;
    window.sessionStorage.removeItem(PENDING_PURCHASE_KEY);
    try {
      const pending = JSON.parse(pendingValue) as {
        slug?: string;
        variantId?: string;
        quantity?: number;
        mode?: 'cart' | 'checkout';
      };
      if (
        pending.slug === slug &&
        typeof pending.variantId === 'string' &&
        typeof pending.quantity === 'number'
      ) {
        if (pending.mode === 'checkout') {
          void startCheckout(pending.variantId, pending.quantity);
        } else {
          void submitCartItem(pending.variantId, pending.quantity);
        }
      }
    } catch {
      setNotice('登录成功，请重新加入购物车');
    }
  }, [slug, startCheckout, submitCartItem]);

  return (
    <div>
      {incompatibleDevice ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          此商品未关联你选择的机型，请先核对型号。
          <Link href="/#choose-device" className="ml-2 underline">
            重新选择机型
          </Link>
          <Link href={`/products/${slug}`} className="ml-2 underline">
            清除机型条件
          </Link>
        </p>
      ) : null}
      {deviceModels.length ? (
        <p className="mb-4 text-sm text-stone-600">
          {selectedDevice
            ? `当前机型：${deviceLabel(selectedDevice)}`
            : `适配：${deviceModels.map(deviceLabel).join('、')}`}
          <Link href="/#choose-device" className="ml-2 underline">
            切换机型
          </Link>
        </p>
      ) : null}
      <div className="flex items-end gap-3">
        <p className="text-3xl font-semibold tracking-[-0.03em]">
          {displayVariant ? `¥${displayVariant.price}` : '暂未定价'}
        </p>
        {displayVariant?.comparePrice ? (
          <p className="pb-1 text-sm text-stone-400 line-through">
            ¥{displayVariant.comparePrice}
          </p>
        ) : null}
      </div>

      {variants.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          当前商品尚未配置可售变体。
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          <button
            type="button"
            onClick={() => {
              initializedSelection.current = true;
              setSelectedAttributes({});
              setQuantity(1);
              setNotice('请重新选择商品规格');
            }}
            className="min-h-11 text-sm underline"
          >
            重新选择规格
          </button>
          {dimensions.map((dimension) => {
            const values = [
              ...new Set(
                normalizedVariants.flatMap((variant) =>
                  variant.selection[dimension]
                    ? [variant.selection[dimension]]
                    : [],
                ),
              ),
            ];
            return (
              <fieldset key={dimension}>
                <legend className="mb-3 text-sm font-semibold">
                  {productDimensionLabels[dimension] ?? dimension}
                  {selectedAttributes[dimension] ? (
                    <span className="ml-2 font-normal text-stone-400">
                      {selectedAttributes[dimension]}
                    </span>
                  ) : null}
                </legend>
                {productDimensionHints[dimension] ? (
                  <p className="mb-3 text-xs leading-5 text-stone-600">
                    {productDimensionHints[dimension]}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2.5">
                  {values.map((value) => {
                    const available = optionIsAvailable(dimension, value);
                    const selected = selectedAttributes[dimension] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        aria-pressed={selected}
                        onClick={() => chooseOption(dimension, value)}
                        className={`relative min-w-20 rounded-xl border px-4 py-2.5 text-sm transition ${
                          selected
                            ? 'border-store-ink bg-store-ink text-white'
                            : available
                              ? 'border-stone-900/12 bg-white hover:border-stone-900/35'
                              : 'cursor-not-allowed border-stone-900/6 bg-stone-100 text-stone-300 line-through'
                        }`}
                      >
                        {value}
                        {availability && !available ? '（售罄）' : ''}
                        {selected ? (
                          <Check className="ml-2 inline size-3.5" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      <div aria-live="polite" aria-atomic="true">
        {availability === null ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-stone-400">
            <span className="size-3 animate-pulse rounded-full bg-stone-300" />{' '}
            正在获取实时可售状态…
          </div>
        ) : availabilityError ? (
          <button
            type="button"
            onClick={() => void loadAvailability()}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600"
          >
            <RefreshCcw className="size-4" /> 获取可售状态失败，点击重试
          </button>
        ) : selectedVariant ? (
          <p
            className={`mt-5 text-sm font-medium ${selectedAvailableQty > 0 ? 'text-store-success' : 'text-red-600'}`}
          >
            {selectedAvailableQty === 0
              ? '暂时缺货'
              : selectedAvailableQty < 5
                ? `仅剩 ${selectedAvailableQty} 件`
                : '可按单生产'}
          </p>
        ) : (
          <p className="mt-5 text-sm text-stone-500">
            请选择
            {dimensions
              .filter((dimension) => !selectedAttributes[dimension])
              .map(
                (dimension) => productDimensionLabels[dimension] ?? dimension,
              )
              .join('、') || '有效的商品规格'}
          </p>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <div className="flex h-12 w-36 items-center justify-between rounded-full border border-stone-900/12 bg-white px-2">
          <button
            type="button"
            aria-label="减少数量"
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid size-9 place-items-center disabled:text-stone-300"
          >
            <Minus className="size-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="增加数量"
            disabled={
              !purchasable || quantity >= Math.min(99, selectedAvailableQty)
            }
            onClick={() =>
              setQuantity((value) => Math.min(selectedAvailableQty, value + 1))
            }
            className="grid size-9 place-items-center disabled:text-stone-300"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={!purchasable || isAdding}
          onClick={() =>
            selectedVariant && void submitCartItem(selectedVariant.id, quantity)
          }
          className="border-store-ink text-store-ink inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border px-6 text-sm font-bold disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
        >
          <ShoppingBag className="size-4" />
          {isAdding ? '处理中…' : '加入购物车'}
        </button>
        <button
          type="button"
          disabled={!purchasable || isAdding}
          onClick={() =>
            selectedVariant && void startCheckout(selectedVariant.id, quantity)
          }
          className="bg-store-ink h-12 flex-1 rounded-full px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
        >
          立即购买
        </button>
      </div>
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-center text-xs text-stone-500"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-3 border-t border-stone-900/8 pt-7 text-xs text-stone-500">
        <p className="flex items-center gap-2">
          <Truck className="text-store-muted size-4" /> 按单生产后发货
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="text-store-muted size-4" /> 出库前逐件检查
        </p>
      </div>
    </div>
  );
}
