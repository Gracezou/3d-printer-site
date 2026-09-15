import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { finishServerTiming } from '@/lib/server-timing';
import { listCustomerOrders } from '@/lib/services/customer-order.service';
import { createOrder } from '@/lib/services/order.service';
import {
  createOrderSchema,
  customerOrderListQuerySchema,
} from '@/lib/validators/order';

export const GET = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const query = parseSearchParams(request, customerOrderListQuerySchema);
  return ok(await listCustomerOrders(customer.id, query));
});

export const POST = withErrorHandler(async (request: Request) => {
  const startedAt = performance.now();
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, createOrderSchema);
  return finishServerTiming(
    ok(await createOrder(customer.id, input), { status: 201 }),
    'order_create',
    startedAt,
  );
});
