import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { refundOrder } from '@/lib/services/refund.service';
import {
  adminOrderIdSchema,
  adminOrderRefundSchema,
} from '@/lib/validators/admin-order';

interface OrderRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: OrderRouteContext) => {
    const admin = await requirePermission('order:refund');
    const orderId = adminOrderIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, adminOrderRefundSchema);
    return ok(
      await refundOrder(orderId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
