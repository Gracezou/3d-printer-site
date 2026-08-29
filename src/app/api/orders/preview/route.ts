import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { previewOrder } from '@/lib/services/order-preview.service';
import { orderPreviewSchema } from '@/lib/validators/order';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, orderPreviewSchema);
  const response = ok(await previewOrder(customer.id, input));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
