import { requireCustomer } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { addCartItem } from '@/lib/services/cart.service';
import { addCartItemSchema } from '@/lib/validators/cart';
import { finishServerTiming } from '@/lib/server-timing';

export const POST = withErrorHandler(async (request: Request) => {
  const startedAt = performance.now();
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, addCartItemSchema);
  return finishServerTiming(
    ok(await addCartItem(customer.id, input), { status: 201 }),
    'cart_add',
    startedAt,
  );
});
