import { ok, withErrorHandler } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { resumeRefund } from '@/lib/services/refund.service';
import { adminOrderIdSchema } from '@/lib/validators/admin-order';

interface RefundRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: RefundRouteContext) => {
    const admin = await requirePermission('order:refund');
    const refundId = adminOrderIdSchema.parse((await params).id);
    return ok(
      await resumeRefund(refundId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
