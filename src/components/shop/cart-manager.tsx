'use client';

import Decimal from 'decimal.js';
import { Minus, Plus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { CHECKOUT_STORAGE_KEY } from '@/lib/checkout-storage';

import { dispatchCartUpdated } from './cart-indicator';

interface CartItem {
  id: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  skuCode: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  availableQty: number;
  isAvailable: boolean;
  unavailableReason: 'off_shelf' | 'out_of_stock' | null;
}

interface CartResponse {
  code: number;
  data: { items: CartItem[] } | null;
  message: string;
}

interface CartMutationResponse {
  code: number;
  data: { id?: string; quantity?: number; cartCount: number } | null;
  message: string;
}

const reasonLabels = {
  off_shelf: '商品已下架',
  out_of_stock: '库存不足',
} as const;

export function CartManager() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const updateTimers = useRef(new Map<string, number>());

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/auth/login?next=%2Fcart');
        return;
      }
      const body = (await response.json()) as CartResponse;
      if (!response.ok || !body.data) throw new Error(body.message);
      setItems(body.data.items);
      dispatchCartUpdated(
        body.data.items.reduce((sum, item) => sum + item.quantity, 0),
      );
      setSelectedIds(
        (current) =>
          new Set(
            body
              .data!.items.filter(
                (item) => item.isAvailable && current.has(item.id),
              )
              .map((item) => item.id),
          ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '购物车加载失败');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => void loadCart(), [loadCart]);

  useEffect(
    () => () => {
      for (const timer of updateTimers.current.values())
        window.clearTimeout(timer);
    },
    [],
  );

  const availableItems = items.filter((item) => item.isAvailable);
  const allSelected =
    availableItems.length > 0 &&
    availableItems.every((item) => selectedIds.has(item.id));
  const total = useMemo(
    () =>
      items
        .filter((item) => item.isAvailable && selectedIds.has(item.id))
        .reduce((sum, item) => sum.add(item.subtotal), new Decimal(0))
        .toFixed(2),
    [items, selectedIds],
  );

  async function commitQuantity(itemId: string, quantity: number) {
    setPendingIds((current) => new Set(current).add(itemId));
    setError(null);
    try {
      const response = await fetch(`/api/cart/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      const body = (await response.json()) as CartMutationResponse;
      if (!response.ok) throw new Error(body.message);
      dispatchCartUpdated(body.data?.cartCount);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '购物车更新失败');
      await loadCart();
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  function scheduleQuantity(item: CartItem, quantity: number): void {
    const previousTimer = updateTimers.current.get(item.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              quantity,
              subtotal: new Decimal(currentItem.unitPrice)
                .mul(quantity)
                .toFixed(2),
              isAvailable: quantity <= currentItem.availableQty,
              unavailableReason:
                quantity <= currentItem.availableQty ? null : 'out_of_stock',
            }
          : currentItem,
      ),
    );
    dispatchCartUpdated(
      items.reduce(
        (sum, currentItem) =>
          sum + (currentItem.id === item.id ? quantity : currentItem.quantity),
        0,
      ),
    );
    updateTimers.current.set(
      item.id,
      window.setTimeout(() => {
        updateTimers.current.delete(item.id);
        void commitQuantity(item.id, quantity);
      }, 250),
    );
  }

  async function removeItem(item: CartItem): Promise<void> {
    const timer = updateTimers.current.get(item.id);
    if (timer) window.clearTimeout(timer);
    updateTimers.current.delete(item.id);
    // 删除操作的网络链路包含鉴权与数据库写入。先同步提交本地状态，
    // 确保浏览器在请求开始前就移除条目；失败时 loadCart 会恢复服务端状态。
    flushSync(() => {
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    });
    dispatchCartUpdated(
      items.reduce(
        (sum, entry) => sum + (entry.id === item.id ? 0 : entry.quantity),
        0,
      ),
    );
    setPendingIds((current) => new Set(current).add(item.id));
    try {
      const response = await fetch(`/api/cart/items/${item.id}`, {
        method: 'DELETE',
      });
      const body = (await response.json()) as CartMutationResponse;
      if (!response.ok) throw new Error(body.message);
      dispatchCartUpdated(body.data?.cartCount);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '购物车更新失败');
      await loadCart();
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function proceedToCheckout(): void {
    const selectedItems = items
      .filter((item) => item.isAvailable && selectedIds.has(item.id))
      .map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));
    if (selectedItems.length === 0) return;
    window.sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify({ items: selectedItems, fromCart: true }),
    );
    router.push('/checkout');
  }

  if (loading && items.length === 0) {
    return (
      <p className="py-24 text-center text-sm text-stone-500">
        正在加载购物车…
      </p>
    );
  }

  if (items.length === 0 && !error) {
    return (
      <div className="py-20 text-center">
        <ShoppingBag className="mx-auto size-12 text-stone-300" />
        <h2 className="mt-5 text-xl font-semibold">购物车还是空的</h2>
        <p className="mt-2 text-sm text-stone-500">
          去挑选一件喜欢的 3D 打印作品吧。
        </p>
        <Link
          href="/products"
          className="bg-store-ink mt-7 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold text-white"
        >
          浏览全部作品
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-3">
        {error ? (
          <button
            type="button"
            onClick={() => void loadCart()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <RefreshCcw className="size-4" /> {error}，点击重试
          </button>
        ) : null}
        {items.map((item) => (
          <article
            key={item.id}
            className={`grid grid-cols-[auto_5.5rem_1fr] gap-4 rounded-3xl border p-4 sm:grid-cols-[auto_7rem_1fr_auto] sm:items-center ${
              item.isAvailable
                ? 'border-stone-900/8 bg-white/70'
                : 'border-red-900/8 bg-stone-100/80 opacity-75'
            }`}
          >
            <input
              type="checkbox"
              aria-label={`选择 ${item.productName}`}
              checked={selectedIds.has(item.id)}
              disabled={!item.isAvailable}
              onChange={(event) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
              className="accent-store-ink size-4"
            />
            <Link
              href={`/products/${item.productSlug}`}
              className="aspect-square overflow-hidden rounded-2xl bg-stone-200"
            >
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
                <span className="grid size-full place-items-center text-xl font-black text-stone-900/10">
                  3D
                </span>
              )}
            </Link>
            <div className="min-w-0">
              <Link
                href={`/products/${item.productSlug}`}
                className="font-semibold hover:underline"
              >
                {item.productName}
              </Link>
              <p className="mt-1 text-xs text-stone-500">
                {item.variantName} · {item.skuCode}
              </p>
              <p className="mt-3 text-sm font-semibold">¥{item.unitPrice}</p>
              {!item.isAvailable && item.unavailableReason ? (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  已失效：{reasonLabels[item.unavailableReason]}
                  {item.unavailableReason === 'out_of_stock'
                    ? `，当前最多可购买 ${item.availableQty} 件`
                    : ''}
                </p>
              ) : null}
            </div>
            <div className="col-start-3 flex items-center justify-between gap-4 sm:col-start-auto sm:block sm:text-right">
              <div className="inline-flex h-9 items-center rounded-full border border-stone-900/10 bg-white px-1">
                <button
                  type="button"
                  aria-label="减少数量"
                  disabled={
                    pendingIds.has(item.id) ||
                    item.quantity <= 1 ||
                    !item.isAvailable
                  }
                  onClick={() => scheduleQuantity(item, item.quantity - 1)}
                  className="grid size-8 place-items-center disabled:text-stone-300"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-semibold">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="增加数量"
                  disabled={
                    pendingIds.has(item.id) ||
                    !item.isAvailable ||
                    item.quantity >= item.availableQty
                  }
                  onClick={() => scheduleQuantity(item, item.quantity + 1)}
                  className="grid size-8 place-items-center disabled:text-stone-300"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="mt-0 flex items-center justify-end gap-3 sm:mt-3">
                <strong className="text-sm">¥{item.subtotal}</strong>
                <button
                  type="button"
                  aria-label={`删除 ${item.productName}`}
                  disabled={pendingIds.has(item.id)}
                  onClick={() => void removeItem(item)}
                  className="text-stone-400 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <aside className="bg-store-ink h-fit rounded-3xl p-6 text-white lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold">订单小计</h2>
        <label className="mt-6 flex items-center gap-3 border-b border-white/10 pb-5 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={availableItems.length === 0}
            onChange={() =>
              setSelectedIds(
                allSelected
                  ? new Set()
                  : new Set(availableItems.map((item) => item.id)),
              )
            }
            className="accent-store-accent size-4"
          />
          全选可用商品（{availableItems.length}）
        </label>
        <div className="flex items-end justify-between py-6">
          <span className="text-sm text-white/60">合计</span>
          <strong className="text-3xl tracking-[-0.03em]">¥{total}</strong>
        </div>
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={proceedToCheckout}
          className="bg-store-accent text-store-ink h-12 w-full rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          去结算
        </button>
        <p className="mt-3 text-center text-xs text-white/45">
          提交前将重新校验价格与可售状态
        </p>
      </aside>
    </div>
  );
}
