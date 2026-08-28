import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { updateMaterial } from '@/lib/services/material.service';
import {
  materialIdSchema,
  updateMaterialSchema,
} from '@/lib/validators/material';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: MaterialRouteContext) => {
    const admin = await requirePermission('material:edit');
    const materialId = materialIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateMaterialSchema);
    return ok(
      await updateMaterial(materialId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
