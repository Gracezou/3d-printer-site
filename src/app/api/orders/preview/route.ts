import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { finishServerTiming } from '@/lib/server-timing';
import { previewOrder } from '@/lib/services/order-preview.service';
import { orderPreviewSchema } from '@/lib/validators/order';

export const POST = withErrorHandler(async (request: Request) => {
  const startedAt = performance.now();
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, orderPreviewSchema);
  const response = finishServerTiming(
    ok(await previewOrder(customer.id, input)),
    'order_preview',
    startedAt,
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
