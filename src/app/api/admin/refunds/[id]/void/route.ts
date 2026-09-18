import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { voidRefundAfterManualVerification } from '@/lib/services/refund.service';
import { adminOrderIdSchema } from '@/lib/validators/admin-order';
import { voidRefundSchema } from '@/lib/validators/return-request';

interface Context {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('order:refund');
    const id = adminOrderIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, voidRefundSchema);
    return ok(
      await voidRefundAfterManualVerification(id, input.conclusion, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
