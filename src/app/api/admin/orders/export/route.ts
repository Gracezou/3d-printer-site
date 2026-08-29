import { requirePermission } from '@/lib/auth/admin';
import { parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { exportAdminOrders } from '@/lib/services/admin-order.service';
import { adminOrderListQuerySchema } from '@/lib/validators/admin-order';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('order:export');
  const query = parseSearchParams(request, adminOrderListQuerySchema);
  const content = await exportAdminOrders(query);
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
