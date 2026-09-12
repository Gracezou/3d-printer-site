import type { Metadata } from 'next';

import { CheckoutManager } from '@/components/shop/checkout-manager';

export const metadata: Metadata = { title: '确认订单' };

export default function CheckoutPage() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
        订单结算
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        确认订单
      </h1>
      <div className="bg-store-mist mt-6 rounded-2xl p-4 text-sm leading-6 text-stone-600">
        商品将在下单后排产打印、去支撑打磨并完成装机复核，7
        个自然日内发出。订单集中时排产可能顺延，进度会同步到订单状态。
      </div>
      <div className="mt-9">
        <CheckoutManager />
      </div>
    </main>
  );
}
