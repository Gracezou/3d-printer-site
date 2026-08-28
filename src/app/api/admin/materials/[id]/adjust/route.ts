import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { adjustMaterialStock } from '@/lib/services/material.service';
import {
  adjustMaterialSchema,
  materialIdSchema,
} from '@/lib/validators/material';

interface MaterialRouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: MaterialRouteContext) => {
    const admin = await requirePermission('material:adjust');
    const materialId = materialIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, adjustMaterialSchema);
    return ok(
      await adjustMaterialStock(materialId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
