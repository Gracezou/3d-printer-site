import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { getAdminDashboard } from '@/lib/services/dashboard.service';

export const GET = withErrorHandler(async () => {
  await requirePermission('dashboard:view');
  return ok(await getAdminDashboard());
});
