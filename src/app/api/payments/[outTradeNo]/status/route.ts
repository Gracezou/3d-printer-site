import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { getPaymentStatus } from '@/lib/services/payment.service';
import { outTradeNoSchema } from '@/lib/validators/payment';

interface PaymentStatusRouteContext {
  params: Promise<{ outTradeNo: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: PaymentStatusRouteContext) => {
    const customer = await requireCustomer();
    const outTradeNo = outTradeNoSchema.parse((await params).outTradeNo);
    return ok(await getPaymentStatus(customer.id, outTradeNo));
  },
);
