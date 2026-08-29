import { requirePermission } from '@/lib/auth/admin';
import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listAdminUsers } from '@/lib/services/admin-user.service';
import { adminUserListQuerySchema } from '@/lib/validators/admin-user';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('user:view');
  const query = parseSearchParams(request, adminUserListQuerySchema);
  return ok(await listAdminUsers(query));
});
