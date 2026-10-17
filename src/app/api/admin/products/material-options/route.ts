import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { listProductMaterialOptions } from '@/lib/services/product-style.service';

export const GET = withErrorHandler(async () => {
  await requirePermission('product:edit');
  return ok({ list: await listProductMaterialOptions() });
});
