'use client';

import { usePathname } from 'next/navigation';

export function ShopSurface({ children }: { children: React.ReactNode }) {
  const isDetail = /^\/products\/[^/]+/.test(usePathname());
  return (
    <div
      className={`store-flat bg-store-canvas min-h-screen text-stone-950 ${isDetail ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0' : ''}`}
    >
      {children}
    </div>
  );
}
