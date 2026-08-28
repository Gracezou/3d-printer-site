import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { updateProductStatus } from '@/lib/services/product.service';
import { productIdSchema, productStatusSchema } from '@/lib/validators/product';

interface ProductRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: ProductRouteContext) => {
    const admin = await requirePermission('product:publish');
    const productId = productIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, productStatusSchema);
    return ok(
      await updateProductStatus(productId, input.status, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
