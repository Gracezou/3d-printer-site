import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth/admin';
import { listAdminReturnRequests } from '@/lib/services/return-request.service';
import { adminReturnListQuerySchema } from '@/lib/validators/return-request';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('return:review');
  return ok(
    await listAdminReturnRequests(
      parseSearchParams(request, adminReturnListQuerySchema),
    ),
  );
});
