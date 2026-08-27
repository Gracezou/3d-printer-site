import { setAdminSession } from '@/lib/auth/admin';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { authenticateAdmin } from '@/lib/services/admin-auth.service';
import { adminLoginSchema } from '@/lib/validators/auth';

export const POST = withErrorHandler(async (request: Request) => {
  const input = await parseJsonBody(request, adminLoginSchema);
  const claims = await authenticateAdmin(input.username, input.password);
  await setAdminSession(claims);
  return ok({
    adminId: claims.sub,
    name: claims.name,
    roleCode: claims.roleCode,
    permissions: claims.permissions,
  });
});
