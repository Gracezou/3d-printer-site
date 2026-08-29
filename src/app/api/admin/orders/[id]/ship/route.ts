import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { shipAdminOrder } from '@/lib/services/admin-order.service';
import {
  adminOrderIdSchema,
  adminOrderShipSchema,
} from '@/lib/validators/admin-order';

interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: OrderRouteContext) => {
    const admin = await requirePermission('order:ship');
    const orderId = adminOrderIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, adminOrderShipSchema);
    return ok(
      await shipAdminOrder(orderId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
