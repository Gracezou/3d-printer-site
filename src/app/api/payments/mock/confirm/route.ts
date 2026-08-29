import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { confirmMockPayment } from '@/lib/services/payment.service';
import { mockConfirmPaymentSchema } from '@/lib/validators/payment';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, mockConfirmPaymentSchema);
  return ok(await confirmMockPayment(customer.id, input.outTradeNo));
});
