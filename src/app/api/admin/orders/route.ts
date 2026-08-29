import { requirePermission } from '@/lib/auth/admin';
import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listAdminOrders } from '@/lib/services/admin-order.service';
import { adminOrderListQuerySchema } from '@/lib/validators/admin-order';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('order:view');
  const query = parseSearchParams(request, adminOrderListQuerySchema);
  return ok(await listAdminOrders(query));
});
