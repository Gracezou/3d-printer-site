import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { stockInMaterial } from '@/lib/services/material.service';
import { materialIdSchema, stockInSchema } from '@/lib/validators/material';
import { storefrontCacheTags } from '@/lib/storefront-cache';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: MaterialRouteContext) => {
    const admin = await requirePermission('material:stock_in');
    const materialId = materialIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, stockInSchema);
    const material = await stockInMaterial(materialId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.products);
    return ok(material);
  },
);
import { revalidateTag } from 'next/cache';
