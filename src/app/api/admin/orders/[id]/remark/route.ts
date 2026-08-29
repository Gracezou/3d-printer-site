import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { updateAdminOrderRemark } from '@/lib/services/admin-order.service';
import {
  adminOrderIdSchema,
  adminOrderRemarkSchema,
} from '@/lib/validators/admin-order';

interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: OrderRouteContext) => {
    const admin = await requirePermission('order:remark');
    const orderId = adminOrderIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, adminOrderRemarkSchema);
    return ok(
      await updateAdminOrderRemark(orderId, input.remark, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
