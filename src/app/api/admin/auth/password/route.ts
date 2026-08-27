import { requireAdmin } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { changeAdminPassword } from '@/lib/services/admin-auth.service';
import { changeAdminPasswordSchema } from '@/lib/validators/auth';

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requireAdmin();
  const input = await parseJsonBody(request, changeAdminPasswordSchema);
  await changeAdminPassword(
    admin,
    input.currentPassword,
    input.newPassword,
    getClientIp(request),
  );
  return ok({ changed: true });
});
