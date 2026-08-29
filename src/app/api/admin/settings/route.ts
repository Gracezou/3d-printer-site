import { revalidatePath } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  getAdminSiteSettings,
  updateAdminSiteSettings,
} from '@/lib/services/admin-settings.service';
import { updateSiteSettingsSchema } from '@/lib/validators/admin-settings';

export const GET = withErrorHandler(async () => {
  await requirePermission('settings:edit');
  return ok(await getAdminSiteSettings());
});

export const PUT = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('settings:edit');
  const input = await parseJsonBody(request, updateSiteSettingsSchema);
  const result = await updateAdminSiteSettings(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidatePath('/', 'layout');
  return ok(result);
});
