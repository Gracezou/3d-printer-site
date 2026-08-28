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

interface CategoryRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: CategoryRouteContext) => {
    const admin = await requirePermission('category:edit');
    const categoryId = categoryIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateCategorySchema);
    return ok(
      await updateCategory(categoryId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: CategoryRouteContext) => {
    const admin = await requirePermission('category:edit');
    const categoryId = categoryIdSchema.parse((await params).id);
    return ok(
      await deleteCategory(categoryId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
