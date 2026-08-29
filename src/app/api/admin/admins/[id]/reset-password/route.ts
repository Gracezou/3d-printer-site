import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { resetAdminAccountPassword } from '@/lib/services/admin-access.service';
import {
  adminAccessIdSchema,
  resetAdminPasswordSchema,
} from '@/lib/validators/admin-access';

interface Context {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('admin:edit');
    const id = adminAccessIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, resetAdminPasswordSchema);
    return ok(
      await resetAdminAccountPassword(id, input.password, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
