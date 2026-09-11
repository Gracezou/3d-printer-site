import { requirePermission } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';
import { listAdminDevices } from '@/lib/services/device.service';

export const GET = withErrorHandler(async () => {
  await requirePermission('device:manage');
  return ok(await listAdminDevices());
});
