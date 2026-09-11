import { revalidateTag } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import { createProduct, listProducts } from '@/lib/services/product.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import {
  createProductSchema,
  productListQuerySchema,
} from '@/lib/validators/product';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('product:view');
  const query = parseSearchParams(request, productListQuerySchema);
  return ok(await listProducts(query));
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('product:edit');
  const input = await parseJsonBody(request, createProductSchema);
  const product = await createProduct(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidateTag(storefrontCacheTags.products);
  return ok(product, { status: 201 });
});
