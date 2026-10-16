'use client';

import { usePathname } from 'next/navigation';

export function ShopSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Product detail presentation belongs to the separately reviewed T227 task.
  const isProductDetail = /^\/products\/[^/]+/.test(pathname);
  return (
    <div
      className={`bg-store-canvas min-h-screen text-stone-950 ${isProductDetail ? '' : 'store-flat'}`}
    >
      {children}
    </div>
  );
}
