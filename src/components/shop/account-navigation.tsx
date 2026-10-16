'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AccountNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="个人中心导航"
      className="mx-auto flex max-w-6xl flex-wrap gap-2 border-b border-stone-900/10 px-5 py-3 sm:px-8"
    >
      {[
        ['/account/orders', '订单与售后'],
        ['/account/addresses', '收货地址'],
        ['/account/profile', '个人资料'],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href!}
          aria-current={pathname.startsWith(href!) ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium ${pathname.startsWith(href!) ? 'bg-store-ink text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
