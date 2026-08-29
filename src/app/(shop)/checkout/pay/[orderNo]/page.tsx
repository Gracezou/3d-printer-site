import type { Metadata } from 'next';

import { PaymentLauncher } from '@/components/shop/payment-launcher';

export const metadata: Metadata = { title: '订单支付' };

interface PaymentPageProps {
  params: Promise<{ orderNo: string }>;
}

export default async function PaymentPage({ params }: PaymentPageProps) {
  const { orderNo } = await params;
  return (
    <main className="mx-auto min-h-[70vh] max-w-xl px-5 py-16 sm:px-8">
      <PaymentLauncher orderNo={orderNo} />
    </main>
  );
}
