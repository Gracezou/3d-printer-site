import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteCategory,
  updateCategory,
} from '@/lib/services/category.service';
import {
  categoryIdSchema,
  updateCategorySchema,
} from '@/lib/validators/category';
import { storefrontCacheTags } from '@/lib/storefront-cache';

interface CategoryRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: CategoryRouteContext) => {
    const admin = await requirePermission('category:edit');
    const categoryId = categoryIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateCategorySchema);
    const category = await updateCategory(categoryId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.categories);
    return ok(category);
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: CategoryRouteContext) => {
    const admin = await requirePermission('category:edit');
    const categoryId = categoryIdSchema.parse((await params).id);
    const category = await deleteCategory(categoryId, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.categories);
    return ok(category);
  },
);
import { revalidateTag } from 'next/cache';
