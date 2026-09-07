import type { Metadata } from 'next';

import { AddressManager } from '@/components/shop/address-manager';

export const metadata: Metadata = { title: '收货地址' };

export default function AddressesPage() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-xs font-bold tracking-[0.2em] text-[#59705f]">
        个人中心
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        收货地址
      </h1>
      <div className="mt-9">
        <AddressManager />
      </div>
    </main>
  );
}
