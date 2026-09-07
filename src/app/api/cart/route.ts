import { requireCustomer } from '@/lib/auth/customer';
import { ok, withErrorHandler } from '@/lib/api-response';
import { listCartItems } from '@/lib/services/cart.service';
import { finishServerTiming } from '@/lib/server-timing';

export const GET = withErrorHandler(async () => {
  const startedAt = performance.now();
  const customer = await requireCustomer();
  return finishServerTiming(
    ok({ items: await listCartItems(customer.id) }),
    'cart_list',
    startedAt,
  );
});
