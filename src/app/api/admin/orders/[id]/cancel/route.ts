import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, withErrorHandler } from '@/lib/api-response';
import { cancelAdminOrder } from '@/lib/services/admin-order.service';
import { adminOrderIdSchema } from '@/lib/validators/admin-order';

interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: OrderRouteContext) => {
    const admin = await requirePermission('order:cancel');
    const orderId = adminOrderIdSchema.parse((await params).id);
    return ok(
      await cancelAdminOrder(orderId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
