import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteAdminAccount,
  getAdminAccount,
  updateAdminAccount,
} from '@/lib/services/admin-access.service';
import {
  adminAccessIdSchema,
  updateAdminAccountSchema,
} from '@/lib/validators/admin-access';

interface Context {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: Context) => {
    await requirePermission('admin:view');
    return ok(
      await getAdminAccount(adminAccessIdSchema.parse((await params).id)),
    );
  },
);

export const PATCH = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('admin:edit');
    const id = adminAccessIdSchema.parse((await params).id);
    return ok(
      await updateAdminAccount(
        id,
        await parseJsonBody(request, updateAdminAccountSchema),
        { admin, ip: getClientIp(request) },
      ),
    );
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('admin:edit');
    const id = adminAccessIdSchema.parse((await params).id);
    return ok(
      await deleteAdminAccount(id, { admin, ip: getClientIp(request) }),
    );
  },
);
