import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { getAdminOrderDetail } from '@/lib/services/admin-order.service';
import { adminOrderIdSchema } from '@/lib/validators/admin-order';

interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: OrderRouteContext) => {
    await requirePermission('order:view');
    const orderId = adminOrderIdSchema.parse((await params).id);
    return ok(await getAdminOrderDetail(orderId));
  },
);
