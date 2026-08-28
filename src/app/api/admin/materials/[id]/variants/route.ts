import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { listMaterialVariants } from '@/lib/services/material.service';
import { materialIdSchema } from '@/lib/validators/material';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: MaterialRouteContext) => {
    await requirePermission('material:view');
    const materialId = materialIdSchema.parse((await params).id);
    return ok(await listMaterialVariants(materialId));
  },
);
