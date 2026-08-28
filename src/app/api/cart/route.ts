import { requireCustomer } from '@/lib/auth/customer';
import { ok, withErrorHandler } from '@/lib/api-response';
import { listCartItems } from '@/lib/services/cart.service';

export const GET = withErrorHandler(async () => {
  const customer = await requireCustomer();
  return ok({ items: await listCartItems(customer.id) });
});
