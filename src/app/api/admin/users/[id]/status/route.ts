import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { updateAdminUserStatus } from '@/lib/services/admin-user.service';
import {
  adminUserIdSchema,
  adminUserStatusSchema,
} from '@/lib/validators/admin-user';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('user:disable');
    const userId = adminUserIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, adminUserStatusSchema);
    return ok(
      await updateAdminUserStatus(userId, input.status, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
