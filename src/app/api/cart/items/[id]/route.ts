import { requireCustomer } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { removeCartItem, updateCartItem } from '@/lib/services/cart.service';
import { cartItemIdSchema, updateCartItemSchema } from '@/lib/validators/cart';
import { finishServerTiming } from '@/lib/server-timing';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, context: RouteContext) => {
    const startedAt = performance.now();
    const customer = await requireCustomer();
    const { id } = await context.params;
    const itemId = cartItemIdSchema.parse(id);
    const input = await parseJsonBody(request, updateCartItemSchema);
    return finishServerTiming(
      ok(await updateCartItem(customer.id, itemId, input.quantity)),
      'cart_update',
      startedAt,
    );
  },
);

export const DELETE = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const startedAt = performance.now();
    const customer = await requireCustomer();
    const { id } = await context.params;
    return finishServerTiming(
      ok(await removeCartItem(customer.id, cartItemIdSchema.parse(id))),
      'cart_delete',
      startedAt,
    );
  },
);
