import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  createAdminRole,
  listAdminRoles,
} from '@/lib/services/admin-access.service';
import { createAdminRoleSchema } from '@/lib/validators/admin-access';

export const GET = withErrorHandler(async () => {
  await requirePermission('admin:view');
  return ok(await listAdminRoles());
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('role:edit');
  const input = await parseJsonBody(request, createAdminRoleSchema);
  return ok(await createAdminRole(input, { admin, ip: getClientIp(request) }), {
    status: 201,
  });
});
