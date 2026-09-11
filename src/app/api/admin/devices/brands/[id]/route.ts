import { revalidateTag } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteDeviceBrand,
  updateDeviceBrand,
} from '@/lib/services/device.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import {
  deviceIdSchema,
  updateDeviceBrandSchema,
} from '@/lib/validators/device';

interface BrandRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: BrandRouteContext) => {
    const admin = await requirePermission('device:manage');
    const brandId = deviceIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateDeviceBrandSchema);
    const brand = await updateDeviceBrand(brandId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.devices);
    return ok(brand);
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: BrandRouteContext) => {
    const admin = await requirePermission('device:manage');
    const brandId = deviceIdSchema.parse((await params).id);
    const result = await deleteDeviceBrand(brandId, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.devices);
    return ok(result);
  },
);
