import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import {
  createAdminAccount,
  listAdminAccounts,
} from '@/lib/services/admin-access.service';
import {
  adminAccountListQuerySchema,
  createAdminAccountSchema,
} from '@/lib/validators/admin-access';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('admin:view');
  return ok(
    await listAdminAccounts(
      parseSearchParams(request, adminAccountListQuerySchema),
    ),
  );
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('admin:edit');
  const input = await parseJsonBody(request, createAdminAccountSchema);
  return ok(
    await createAdminAccount(input, { admin, ip: getClientIp(request) }),
    { status: 201 },
  );
});
