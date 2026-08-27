import { requireAdmin } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';

export const GET = withErrorHandler(async () => {
  const admin = await requireAdmin();
  return ok({
    adminId: admin.sub,
    username: admin.username,
    name: admin.name,
    roleCode: admin.roleCode,
    permissions: admin.permissions,
  });
});
