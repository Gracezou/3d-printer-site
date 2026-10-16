'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CartResponse {
  code: number;
  data: { items: Array<{ quantity: number }> } | null;
}

export const CART_UPDATED_EVENT = 'cart-updated';

export function dispatchCartUpdated(count?: number): void {
  window.dispatchEvent(
    new CustomEvent(CART_UPDATED_EVENT, { detail: { count } }),
  );
}

export function CartIndicator() {
  const [count, setCount] = useState(0);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const requestVersion = ++version.current;
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      if (!response.ok) {
        if (requestVersion === version.current) setCount(0);
        return;
      }
      const body = (await response.json()) as CartResponse;
      if (requestVersion === version.current)
        setCount(
          body.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
        );
    } catch {
      if (requestVersion === version.current) setCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleUpdate = (event: Event) => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === 'number') {
        version.current += 1;
        setCount(count);
      } else void refresh();
    };
    window.addEventListener(CART_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(CART_UPDATED_EVENT, handleUpdate);
  }, [refresh]);

  return (
    <Link
      href="/cart"
      aria-label={`购物车，当前 ${count} 件商品`}
      className="relative grid size-10 place-items-center rounded-full transition hover:bg-stone-900/5"
    >
      <ShoppingBag className="size-5" />
      <span className="bg-store-accent text-store-ink ring-store-canvas absolute top-0 right-0 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ring-2">
        {count > 99 ? '99+' : count}
      </span>
    </Link>
  );
}
