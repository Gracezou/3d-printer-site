import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import {
  createDiscountCode,
  listDiscountCodes,
} from '@/lib/services/admin-discount-code.service';
import {
  createDiscountCodeSchema,
  discountCodeListQuerySchema,
} from '@/lib/validators/discount-code';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('promotion:view');
  const query = parseSearchParams(request, discountCodeListQuerySchema);
  return ok(await listDiscountCodes(query));
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('promotion:edit');
  const input = await parseJsonBody(request, createDiscountCodeSchema);
  return ok(
    await createDiscountCode(input, { admin, ip: getClientIp(request) }),
    { status: 201 },
  );
});
