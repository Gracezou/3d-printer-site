import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  getAdminShippingRules,
  updateAdminShippingRules,
} from '@/lib/services/admin-settings.service';
import { updateShippingRulesSchema } from '@/lib/validators/admin-settings';

export const GET = withErrorHandler(async () => {
  await requirePermission('settings:edit');
  return ok(await getAdminShippingRules());
});

export const PUT = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('settings:edit');
  const input = await parseJsonBody(request, updateShippingRulesSchema);
  return ok(
    await updateAdminShippingRules(input, {
      admin,
      ip: getClientIp(request),
    }),
  );
});
