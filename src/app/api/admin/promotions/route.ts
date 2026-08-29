import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import {
  createPromotion,
  listPromotions,
} from '@/lib/services/admin-promotion.service';
import {
  createPromotionSchema,
  promotionListQuerySchema,
} from '@/lib/validators/promotion';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('promotion:view');
  const query = parseSearchParams(request, promotionListQuerySchema);
  return ok(await listPromotions(query));
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('promotion:edit');
  const input = await parseJsonBody(request, createPromotionSchema);
  return ok(await createPromotion(input, { admin, ip: getClientIp(request) }), {
    status: 201,
  });
});
