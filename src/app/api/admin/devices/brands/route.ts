import { revalidateTag } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { createDeviceBrand } from '@/lib/services/device.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import { createDeviceBrandSchema } from '@/lib/validators/device';

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('device:manage');
  const input = await parseJsonBody(request, createDeviceBrandSchema);
  const brand = await createDeviceBrand(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidateTag(storefrontCacheTags.devices);
  return ok(brand, { status: 201 });
});
