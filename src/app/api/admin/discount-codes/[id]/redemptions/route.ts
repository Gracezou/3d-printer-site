import { requirePermission } from '@/lib/auth/admin';
import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listDiscountRedemptions } from '@/lib/services/admin-discount-code.service';
import {
  discountCodeIdSchema,
  redemptionListQuerySchema,
} from '@/lib/validators/discount-code';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    await requirePermission('promotion:view');
    const codeId = discountCodeIdSchema.parse((await params).id);
    const query = parseSearchParams(request, redemptionListQuerySchema);
    return ok(await listDiscountRedemptions(codeId, query));
  },
);
