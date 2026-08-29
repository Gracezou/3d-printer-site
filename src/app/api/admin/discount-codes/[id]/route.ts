import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteDiscountCode,
  getDiscountCode,
  updateDiscountCode,
} from '@/lib/services/admin-discount-code.service';
import {
  discountCodeIdSchema,
  updateDiscountCodeSchema,
} from '@/lib/validators/discount-code';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    await requirePermission('promotion:view');
    const codeId = discountCodeIdSchema.parse((await params).id);
    return ok(await getDiscountCode(codeId));
  },
);

export const PATCH = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('promotion:edit');
    const codeId = discountCodeIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateDiscountCodeSchema);
    return ok(
      await updateDiscountCode(codeId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('promotion:edit');
    const codeId = discountCodeIdSchema.parse((await params).id);
    return ok(
      await deleteDiscountCode(codeId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
