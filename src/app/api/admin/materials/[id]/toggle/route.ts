import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { toggleMaterial } from '@/lib/services/material.service';
import {
  materialIdSchema,
  toggleMaterialSchema,
} from '@/lib/validators/material';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: MaterialRouteContext) => {
    const admin = await requirePermission('material:edit');
    const materialId = materialIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, toggleMaterialSchema);
    return ok(
      await toggleMaterial(materialId, input.isActive, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
