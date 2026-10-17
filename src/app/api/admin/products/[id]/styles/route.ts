import { revalidateTag } from 'next/cache';
import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { replaceProductStyles } from '@/lib/services/product-style.service';
import { replaceProductStylesSchema } from '@/lib/validators/product-style';
import { productIdSchema } from '@/lib/validators/product';
import { storefrontCacheTags } from '@/lib/storefront-cache';

export const PUT = withErrorHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requirePermission('product:edit');
    const input = await parseJsonBody(request, replaceProductStylesSchema);
    const detail = await replaceProductStyles(
      productIdSchema.parse((await params).id),
      input,
      { admin, ip: getClientIp(request) },
    );
    revalidateTag(storefrontCacheTags.products);
    return ok(detail);
  },
);
