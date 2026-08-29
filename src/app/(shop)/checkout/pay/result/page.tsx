import type { Metadata } from 'next';

import { PaymentResult } from '@/components/shop/payment-result';

export const metadata: Metadata = { title: '支付结果' };

interface PaymentResultPageProps {
  searchParams: Promise<{ outTradeNo?: string }>;
}

export default async function PaymentResultPage({
  searchParams,
}: PaymentResultPageProps) {
  const outTradeNo = (await searchParams).outTradeNo?.trim();
  return (
    <main className="mx-auto min-h-[70vh] max-w-xl px-5 py-16 sm:px-8">
      {outTradeNo ? (
        <PaymentResult outTradeNo={outTradeNo} />
      ) : (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">缺少支付单号</h1>
        </div>
      )}
    </main>
  );
}
