import { requireCustomer } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { addCartItem } from '@/lib/services/cart.service';
import { addCartItemSchema } from '@/lib/validators/cart';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, addCartItemSchema);
  return ok(await addCartItem(customer.id, input), { status: 201 });
});
