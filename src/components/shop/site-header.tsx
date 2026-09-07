'use client';

import { Menu, Search, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { CartIndicator } from './cart-indicator';

interface SiteHeaderProps {
  siteName: string;
}

const navigation = [
  { href: '/', label: '首页' },
  { href: '/products', label: '全部作品' },
  { href: '/account/orders', label: '我的订单' },
  { href: '/account/profile', label: '个人资料' },
] as const;

export function SiteHeader({ siteName }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-900/8 bg-[#f7f5ef]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-5 px-5 sm:px-8">
        <button
          type="button"
          aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-full border border-stone-900/10 lg:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#17251c] text-[11px] font-black tracking-tight text-[#d9ff68]">
            3D
          </span>
          <span className="text-sm font-black tracking-[0.15em] text-[#17251c] sm:text-base">
            {siteName}
          </span>
        </Link>

        <nav
          aria-label="主导航"
          className="ml-5 hidden items-center gap-7 lg:flex"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-stone-600 transition hover:text-stone-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form
          action="/products"
          className="ml-auto hidden max-w-xs flex-1 md:block"
        >
          <label className="relative block">
            <span className="sr-only">搜索商品</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              name="keyword"
              placeholder="搜索作品"
              className="h-11 w-full rounded-full border border-stone-900/8 bg-white/70 pr-4 pl-11 text-sm transition outline-none placeholder:text-stone-400 focus:border-stone-900/25 focus:bg-white"
            />
          </label>
        </form>

        <div className="flex items-center gap-1">
          <Link
            href="/account/profile"
            aria-label="进入用户中心"
            className="grid size-10 place-items-center rounded-full transition hover:bg-stone-900/5"
          >
            <UserRound className="size-5" />
          </Link>
          <CartIndicator />
        </div>
      </div>

      {menuOpen ? (
        <nav
          aria-label="移动端导航"
          className="border-t border-stone-900/8 px-5 py-4 lg:hidden"
        >
          <form action="/products" className="mb-4 md:hidden">
            <label className="relative block">
              <span className="sr-only">搜索商品</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                name="keyword"
                placeholder="搜索作品"
                className="h-11 w-full rounded-full border border-stone-900/8 bg-white pr-4 pl-11 text-sm outline-none"
              />
            </label>
          </form>
          <div className="flex flex-col">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-stone-900/6 py-3 text-sm font-medium last:border-0"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
