import type { Metadata } from 'next';

import { MockPaymentConfirm } from '@/components/shop/mock-payment-confirm';
import { outTradeNoSchema } from '@/lib/validators/payment';

export const metadata: Metadata = { title: '模拟支付' };

interface MockPaymentPageProps {
  searchParams: Promise<{ outTradeNo?: string; amount?: string }>;
}

export default async function MockPaymentPage({
  searchParams,
}: MockPaymentPageProps) {
  const query = await searchParams;
  const outTradeNo = outTradeNoSchema.safeParse(query.outTradeNo);
  const amount = /^\d+(?:\.\d{1,2})?$/.test(query.amount ?? '')
    ? query.amount!
    : '0.00';
  return (
    <main className="mx-auto min-h-[70vh] max-w-xl px-5 py-16 sm:px-8">
      {outTradeNo.success ? (
        <MockPaymentConfirm outTradeNo={outTradeNo.data} amount={amount} />
      ) : (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          支付单号无效
        </div>
      )}
    </main>
  );
}
