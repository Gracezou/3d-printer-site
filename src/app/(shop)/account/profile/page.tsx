import type { Metadata } from 'next';
import Link from 'next/link';

import { ProfileManager } from '@/components/shop/profile-manager';

export const metadata: Metadata = { title: '个人资料' };

export default function ProfilePage() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
        个人中心
      </p>
      <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em]">
            个人资料
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            管理昵称和下单时使用的默认联系电话
          </p>
        </div>
        <Link
          href="/account/addresses"
          className="text-store-leaf text-sm font-semibold"
        >
          管理收货地址
        </Link>
      </div>
      <div className="mt-9">
        <ProfileManager />
      </div>
    </main>
  );
}
