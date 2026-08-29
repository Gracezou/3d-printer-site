'use client';

import Decimal from 'decimal.js';
import { Minus, Plus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CHECKOUT_STORAGE_KEY } from '@/lib/checkout-storage';

import { CART_UPDATED_EVENT } from './cart-indicator';

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

const reasonLabels = {
  off_shelf: '商品已下架',
  out_of_stock: '库存不足',
} as const;

export function CartManager() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.assign('/auth/login?next=%2Fcart');
        return;
      }
      const body = (await response.json()) as CartResponse;
      if (!response.ok || !body.data) throw new Error(body.message);
      setItems(body.data.items);
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
  }, []);

  useEffect(() => void loadCart(), [loadCart]);

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

  async function mutateItem(
    item: CartItem,
    method: 'PATCH' | 'DELETE',
    quantity?: number,
  ) {
    setPendingId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/cart/items/${item.id}`, {
        method,
        headers: quantity ? { 'Content-Type': 'application/json' } : undefined,
        body: quantity ? JSON.stringify({ quantity }) : undefined,
      });
      const body = (await response.json()) as CartResponse;
      if (!response.ok) throw new Error(body.message);
      await loadCart();
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '购物车更新失败');
      await loadCart();
    } finally {
      setPendingId(null);
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
    window.location.assign('/checkout');
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
          className="mt-7 inline-flex h-11 items-center rounded-full bg-[#17251c] px-6 text-sm font-bold text-white"
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
              className="size-4 accent-[#17251c]"
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
                    pendingId === item.id ||
                    item.quantity <= 1 ||
                    !item.isAvailable
                  }
                  onClick={() =>
                    void mutateItem(item, 'PATCH', item.quantity - 1)
                  }
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
                    pendingId === item.id ||
                    !item.isAvailable ||
                    item.quantity >= item.availableQty
                  }
                  onClick={() =>
                    void mutateItem(item, 'PATCH', item.quantity + 1)
                  }
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
                  disabled={pendingId === item.id}
                  onClick={() => void mutateItem(item, 'DELETE')}
                  className="text-stone-400 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <aside className="h-fit rounded-3xl bg-[#17251c] p-6 text-white lg:sticky lg:top-24">
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
            className="size-4 accent-[#d9ff68]"
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
          className="h-12 w-full rounded-full bg-[#d9ff68] text-sm font-bold text-[#17251c] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
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
