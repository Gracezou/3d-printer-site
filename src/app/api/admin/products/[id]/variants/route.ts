import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { replaceProductVariants } from '@/lib/services/product.service';
import {
  productIdSchema,
  replaceVariantsSchema,
} from '@/lib/validators/product';
import { storefrontCacheTags } from '@/lib/storefront-cache';

interface ProductRouteContext {
  params: Promise<{ id: string }>;
}

export const PUT = withErrorHandler(
  async (request: Request, { params }: ProductRouteContext) => {
    const admin = await requirePermission('product:edit');
    const productId = productIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, replaceVariantsSchema);
    const variants = await replaceProductVariants(productId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.products);
    return ok(variants);
  },
);
import { revalidateTag } from 'next/cache';
