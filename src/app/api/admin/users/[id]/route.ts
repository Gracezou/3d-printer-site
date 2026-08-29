import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { getAdminUserDetail } from '@/lib/services/admin-user.service';
import { adminUserIdSchema } from '@/lib/validators/admin-user';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    await requirePermission('user:view');
    const userId = adminUserIdSchema.parse((await params).id);
    return ok(await getAdminUserDetail(userId));
  },
);
