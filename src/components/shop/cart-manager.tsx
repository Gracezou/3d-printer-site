'use client';

import Decimal from 'decimal.js';
import { Minus, Plus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartMutationQueue } from '@/lib/cart-mutation-queue';

import { CHECKOUT_STORAGE_KEY } from '@/lib/checkout-storage';
import type { ProductDevice } from '@/lib/product-devices';
import { DeviceFit } from './device-fit';

import { dispatchCartUpdated } from './cart-indicator';

interface CartItem {
  deviceModels?: ProductDevice[];
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
  const itemsRef = useRef<CartItem[]>([]);
  const confirmedItems = useRef(new Map<string, CartItem>());
  const positions = useRef(new Map<string, number>());
  const loadVersion = useRef(0);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const publishItems = useCallback((next: CartItem[]) => {
    itemsRef.current = next;
    setItems(next);
    dispatchCartUpdated(next.reduce((sum, item) => sum + item.quantity, 0));
  }, []);

  const mutations = useMemo(
    () =>
      new CartMutationQueue({
        async send(id, quantity) {
          const response = await fetch(`/api/cart/items/${id}`, {
            method: quantity === null ? 'DELETE' : 'PATCH',
            ...(quantity === null
              ? {}
              : {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ quantity }),
                }),
          });
          if (response.status === 401)
            router.replace('/auth/login?next=%2Fcart');
          const body = (await response.json()) as CartMutationResponse;
          if (!response.ok || body.code !== 0)
            throw new Error(body.message || '购物车更新失败');
        },
        committed(id, quantity) {
          const item = confirmedItems.current.get(id);
          if (quantity === null) confirmedItems.current.delete(id);
          else if (item)
            confirmedItems.current.set(id, {
              ...item,
              quantity,
              subtotal: new Decimal(item.unitPrice).mul(quantity).toFixed(2),
              isAvailable:
                item.unavailableReason !== 'off_shelf' &&
                quantity <= item.availableQty,
              unavailableReason:
                item.unavailableReason === 'off_shelf'
                  ? 'off_shelf'
                  : quantity <= item.availableQty
                    ? null
                    : 'out_of_stock',
            });
        },
        failed(id, caught) {
          const restored = confirmedItems.current.get(id);
          if (restored) {
            const next = itemsRef.current.filter((item) => item.id !== id);
            next.push(restored);
            next.sort(
              (a, b) =>
                (positions.current.get(a.id) ?? 0) -
                (positions.current.get(b.id) ?? 0),
            );
            publishItems(next);
          }
          setItemErrors((current) => ({
            ...current,
            [id]:
              caught instanceof Error
                ? caught.message
                : '保存失败，请重试该商品操作',
          }));
        },
        idle(id) {
          setPendingIds((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        },
      }),
    [publishItems, router],
  );

  const loadCart = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/auth/login?next=%2Fcart');
        return;
      }
      const body = (await response.json()) as CartResponse;
      if (version !== loadVersion.current) return;
      if (!response.ok || !body.data) throw new Error(body.message);
      setItemErrors({});
      confirmedItems.current = new Map(
        body.data.items.map((item) => [item.id, item]),
      );
      positions.current = new Map(
        body.data.items.map((item, index) => [item.id, index]),
      );
      publishItems(body.data.items);
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
      if (version !== loadVersion.current) return;
      setError(caught instanceof Error ? caught.message : '购物车加载失败');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [publishItems, router]);

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

  function scheduleQuantity(item: CartItem, quantity: number): void {
    setPendingIds((current) => new Set(current).add(item.id));
    setItemErrors((current) => ({ ...current, [item.id]: '' }));
    publishItems(
      itemsRef.current.map((currentItem) =>
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
    mutations.set(item.id, quantity);
  }

  function removeItem(item: CartItem): void {
    publishItems(itemsRef.current.filter((entry) => entry.id !== item.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setPendingIds((current) => new Set(current).add(item.id));
    setItemErrors((current) => ({ ...current, [item.id]: '' }));
    mutations.set(item.id, null);
  }

  function proceedToCheckout(): void {
    if (pendingIds.size) return;
    const selectedItems = items
      .filter((item) => item.isAvailable && selectedIds.has(item.id))
      .map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));
    if (selectedItems.length === 0) return;
    try {
      window.sessionStorage.setItem(
        CHECKOUT_STORAGE_KEY,
        JSON.stringify({ items: selectedItems, fromCart: true }),
      );
    } catch {
      setError('无法保存结算信息，请允许浏览器使用站点存储后重试');
      return;
    }
    router.push('/checkout');
  }

  if (loading && items.length === 0) {
    return (
      <p role="status" className="py-24 text-center text-sm text-stone-500">
        正在加载购物车…
      </p>
    );
  }

  if (items.length === 0 && !error) {
    return (
      <div className="py-20 text-center">
        <ShoppingBag className="mx-auto size-12 text-stone-300" />
        <h2 role="status" className="mt-5 text-xl font-semibold">
          {pendingIds.size ? '正在保存购物车…' : '购物车还是空的'}
        </h2>
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
      <section className="min-w-0 space-y-3">
        {error ? (
          <button
            type="button"
            disabled={pendingIds.size > 0}
            onClick={() => void loadCart()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <RefreshCcw className="size-4" /> {error}，点击重试
          </button>
        ) : null}
        {items.map((item) => (
          <article
            key={item.id}
            className={`grid grid-cols-[auto_4rem_minmax(0,1fr)] gap-3 rounded-lg border p-4 sm:grid-cols-[auto_7rem_minmax(0,1fr)_auto] sm:items-center ${
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
              <DeviceFit devices={item.deviceModels} />
              {itemErrors[item.id] ? (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {itemErrors[item.id]}，已恢复该商品，请重试。
                  <button
                    type="button"
                    disabled={pendingIds.size > 0}
                    onClick={() => void loadCart()}
                    className="ml-2 min-h-11 underline disabled:opacity-50"
                  >
                    刷新核对购物车
                  </button>
                </p>
              ) : null}
              {!item.isAvailable && item.unavailableReason ? (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  已失效：{reasonLabels[item.unavailableReason]}
                  {item.unavailableReason === 'out_of_stock'
                    ? `，当前最多可购买 ${item.availableQty} 件`
                    : ''}
                </p>
              ) : null}
            </div>
            <div className="col-span-2 col-start-2 flex flex-wrap items-center justify-between gap-3 sm:col-span-1 sm:col-start-auto sm:block sm:text-right">
              <div className="inline-flex h-11 items-center rounded-lg border border-stone-900/10 bg-white">
                <button
                  type="button"
                  aria-label="减少数量"
                  disabled={
                    item.quantity <= 1 || item.unavailableReason === 'off_shelf'
                  }
                  onClick={() => scheduleQuantity(item, item.quantity - 1)}
                  className="grid size-11 place-items-center disabled:text-stone-300"
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
                    !item.isAvailable ||
                    item.quantity >= Math.min(99, item.availableQty)
                  }
                  onClick={() => scheduleQuantity(item, item.quantity + 1)}
                  className="grid size-11 place-items-center disabled:text-stone-300"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="mt-0 flex items-center justify-end gap-3 sm:mt-3">
                <strong className="text-sm">¥{item.subtotal}</strong>
                <button
                  type="button"
                  aria-label={`删除 ${item.productName}`}
                  onClick={() => void removeItem(item)}
                  className="grid size-11 place-items-center text-stone-500 hover:text-red-600"
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
          disabled={selectedIds.size === 0 || pendingIds.size > 0}
          onClick={proceedToCheckout}
          className="bg-store-accent text-store-ink h-12 w-full rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          {pendingIds.size ? '正在保存…' : '去结算'}
        </button>
        <p className="mt-3 text-center text-xs text-white/45">
          提交前将重新校验价格与可售状态
        </p>
      </aside>
    </div>
  );
}
