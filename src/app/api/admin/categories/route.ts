import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  createCategory,
  listCategories,
} from '@/lib/services/category.service';
import { createCategorySchema } from '@/lib/validators/category';
import { storefrontCacheTags } from '@/lib/storefront-cache';

export const GET = withErrorHandler(async () => {
  await requirePermission('category:view');
  return ok(await listCategories());
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('category:edit');
  const input = await parseJsonBody(request, createCategorySchema);
  const category = await createCategory(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidateTag(storefrontCacheTags.categories);
  return ok(category, { status: 201 });
});
import { revalidateTag } from 'next/cache';
