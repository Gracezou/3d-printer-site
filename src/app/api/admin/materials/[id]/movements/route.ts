import { requirePermission } from '@/lib/auth/admin';
import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listMaterialMovements } from '@/lib/services/material.service';
import {
  materialIdSchema,
  movementListQuerySchema,
} from '@/lib/validators/material';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (request: Request, { params }: MaterialRouteContext) => {
    await requirePermission('material:view');
    const materialId = materialIdSchema.parse((await params).id);
    const query = parseSearchParams(request, movementListQuerySchema);
    return ok(await listMaterialMovements(materialId, query));
  },
);
