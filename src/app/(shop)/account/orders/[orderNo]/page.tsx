import type { Metadata } from 'next';

import { OrderDetail } from '@/components/shop/order-detail';
import { customerOrderNoSchema } from '@/lib/validators/order';

export const metadata: Metadata = { title: '订单详情' };

interface PageProps {
  params: Promise<{ orderNo: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const orderNo = customerOrderNoSchema.parse((await params).orderNo);
  return <OrderDetail orderNo={orderNo} />;
}
