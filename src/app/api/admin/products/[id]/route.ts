import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteProduct,
  getProductDetail,
  updateProduct,
} from '@/lib/services/product.service';
import { productIdSchema, updateProductSchema } from '@/lib/validators/product';
import { storefrontCacheTags } from '@/lib/storefront-cache';

interface ProductRouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: ProductRouteContext) => {
    await requirePermission('product:view');
    const productId = productIdSchema.parse((await params).id);
    return ok(await getProductDetail(productId));
  },
);

export const PATCH = withErrorHandler(
  async (request: Request, { params }: ProductRouteContext) => {
    const admin = await requirePermission('product:edit');
    const productId = productIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateProductSchema);
    const product = await updateProduct(productId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.products);
    return ok(product);
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: ProductRouteContext) => {
    const admin = await requirePermission('product:edit');
    const productId = productIdSchema.parse((await params).id);
    const product = await deleteProduct(productId, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.products);
    return ok(product);
  },
);
import { revalidateTag } from 'next/cache';
