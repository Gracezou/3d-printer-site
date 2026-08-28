import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  createCategory,
  listCategories,
} from '@/lib/services/category.service';
import { createCategorySchema } from '@/lib/validators/category';

export const GET = withErrorHandler(async () => {
  await requirePermission('category:view');
  return ok(await listCategories());
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('category:edit');
  const input = await parseJsonBody(request, createCategorySchema);
  return ok(await createCategory(input, { admin, ip: getClientIp(request) }), {
    status: 201,
  });
});
