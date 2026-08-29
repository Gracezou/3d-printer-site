import { requirePermission } from '@/lib/auth/admin';
import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listPrintJobs } from '@/lib/services/production.service';
import { printJobListQuerySchema } from '@/lib/validators/production';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('production:view');
  const query = parseSearchParams(request, printJobListQuerySchema);
  return ok(await listPrintJobs(query));
});
