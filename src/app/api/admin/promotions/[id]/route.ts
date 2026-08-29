import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deletePromotion,
  getPromotion,
  updatePromotion,
} from '@/lib/services/admin-promotion.service';
import {
  promotionIdSchema,
  updatePromotionSchema,
} from '@/lib/validators/promotion';

interface PromotionRouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: PromotionRouteContext) => {
    await requirePermission('promotion:view');
    const promotionId = promotionIdSchema.parse((await params).id);
    return ok(await getPromotion(promotionId));
  },
);

export const PATCH = withErrorHandler(
  async (request: Request, { params }: PromotionRouteContext) => {
    const admin = await requirePermission('promotion:edit');
    const promotionId = promotionIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updatePromotionSchema);
    return ok(
      await updatePromotion(promotionId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: PromotionRouteContext) => {
    const admin = await requirePermission('promotion:edit');
    const promotionId = promotionIdSchema.parse((await params).id);
    return ok(
      await deletePromotion(promotionId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
