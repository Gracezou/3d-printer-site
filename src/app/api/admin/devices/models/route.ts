import { revalidateTag } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { createDeviceModel } from '@/lib/services/device.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import { createDeviceModelSchema } from '@/lib/validators/device';

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('device:manage');
  const input = await parseJsonBody(request, createDeviceModelSchema);
  const model = await createDeviceModel(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidateTag(storefrontCacheTags.devices);
  revalidateTag(storefrontCacheTags.products);
  return ok(model, { status: 201 });
});
