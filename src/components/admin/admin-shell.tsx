'use client';

import {
  BadgePercent,
  Boxes,
  ChevronRight,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Printer,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TicketPercent,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

interface AdminShellProps {
  admin: {
    name: string;
    username: string;
    roleCode: string;
  };
  children: ReactNode;
}

const navigation = [
  { href: '/admin', label: '工作台', icon: LayoutDashboard, enabled: true },
  { href: '/admin/materials', label: '耗材管理', icon: Boxes, enabled: true },
  {
    href: '/admin/categories',
    label: '分类管理',
    icon: FolderTree,
    enabled: true,
  },
  {
    href: '/admin/products',
    label: '商品管理',
    icon: ShoppingBag,
    enabled: true,
  },
  {
    href: '/admin/orders',
    label: '订单管理',
    icon: PackageSearch,
    enabled: true,
  },
  {
    href: '/admin/production',
    label: '生产看板',
    icon: Printer,
    enabled: true,
  },
  {
    href: '/admin/promotions',
    label: '优惠规则',
    icon: BadgePercent,
    enabled: true,
  },
  {
    href: '/admin/discount-codes',
    label: '折扣码',
    icon: TicketPercent,
    enabled: true,
  },
  { href: '/admin/users', label: '用户管理', icon: Users, enabled: true },
  {
    href: '/admin/admins',
    label: '权限管理',
    icon: ShieldCheck,
    enabled: true,
  },
  { href: '#', label: '系统设置', icon: Settings, enabled: false },
] as const;

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/admin/login');
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-[#151816] text-white">
      <div className="flex h-20 items-center justify-between border-b border-white/8 px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-lime-300 text-sm font-black text-[#151816]">
            3D
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">
              PRINT STUDIO
            </span>
            <span className="block text-[10px] tracking-[0.22em] text-white/38">
              OPERATIONS
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label="关闭菜单"
          className="rounded-lg p-2 text-white/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-white/30">
          管理模块
        </p>
        {navigation.map((item) => {
          const active =
            item.enabled &&
            (item.href === '/admin'
              ? pathname === item.href
              : pathname.startsWith(item.href));
          const Icon = item.icon;
          if (!item.enabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/26"
              >
                <Icon className="size-[18px]" />
                <span>{item.label}</span>
                <span className="ml-auto rounded-full border border-white/8 px-1.5 py-0.5 text-[9px] tracking-wide">
                  稍后
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-lime-300 font-semibold text-[#151816]'
                  : 'text-white/62 hover:bg-white/6 hover:text-white'
              }`}
            >
              <Icon className="size-[18px]" />
              <span>{item.label}</span>
              {active ? <ChevronRight className="ml-auto size-4" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/8 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/4 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">
            {initials(admin.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{admin.name}</p>
            <p className="truncate text-xs text-white/38">
              {admin.username} · {admin.roleCode}
            </p>
          </div>
          <button
            type="button"
            title="退出登录"
            disabled={loggingOut}
            onClick={logout}
            className="rounded-lg p-2 text-white/38 transition hover:bg-white/8 hover:text-white disabled:opacity-40"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f5f2]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭菜单遮罩"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-72 shadow-2xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-black/6 bg-[#f4f5f2]/90 px-4 backdrop-blur-xl sm:px-7 lg:hidden">
          <button
            type="button"
            aria-label="打开菜单"
            className="rounded-xl border border-black/8 bg-white p-2.5"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <span className="ml-3 text-sm font-semibold">PRINT STUDIO</span>
        </header>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
