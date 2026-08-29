import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { createOrder } from '@/lib/services/order.service';
import { createOrderSchema } from '@/lib/validators/order';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, createOrderSchema);
  return ok(await createOrder(customer.id, input), { status: 201 });
});
