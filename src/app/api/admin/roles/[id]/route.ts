import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteAdminRole,
  updateAdminRole,
} from '@/lib/services/admin-access.service';
import {
  adminAccessIdSchema,
  updateAdminRoleSchema,
} from '@/lib/validators/admin-access';

interface Context {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('role:edit');
    const id = adminAccessIdSchema.parse((await params).id);
    return ok(
      await updateAdminRole(
        id,
        await parseJsonBody(request, updateAdminRoleSchema),
        { admin, ip: getClientIp(request) },
      ),
    );
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('role:edit');
    const id = adminAccessIdSchema.parse((await params).id);
    return ok(await deleteAdminRole(id, { admin, ip: getClientIp(request) }));
  },
);
