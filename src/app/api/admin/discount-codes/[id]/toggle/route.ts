import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { toggleDiscountCode } from '@/lib/services/admin-discount-code.service';
import {
  discountCodeIdSchema,
  toggleDiscountCodeSchema,
} from '@/lib/validators/discount-code';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('promotion:edit');
    const codeId = discountCodeIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, toggleDiscountCodeSchema);
    return ok(
      await toggleDiscountCode(codeId, input.isActive, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
