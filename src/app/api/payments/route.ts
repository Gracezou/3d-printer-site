import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { createPayment } from '@/lib/services/payment.service';
import { createPaymentSchema } from '@/lib/validators/payment';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, createPaymentSchema);
  return ok(await createPayment(customer.id, input.orderNo), { status: 201 });
});
