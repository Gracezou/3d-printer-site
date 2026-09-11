import { revalidateTag } from 'next/cache';

import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import {
  deleteDeviceModel,
  updateDeviceModel,
} from '@/lib/services/device.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import {
  deviceIdSchema,
  updateDeviceModelSchema,
} from '@/lib/validators/device';

interface ModelRouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, { params }: ModelRouteContext) => {
    const admin = await requirePermission('device:manage');
    const modelId = deviceIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, updateDeviceModelSchema);
    const model = await updateDeviceModel(modelId, input, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.devices);
    revalidateTag(storefrontCacheTags.products);
    return ok(model);
  },
);

export const DELETE = withErrorHandler(
  async (request: Request, { params }: ModelRouteContext) => {
    const admin = await requirePermission('device:manage');
    const modelId = deviceIdSchema.parse((await params).id);
    const result = await deleteDeviceModel(modelId, {
      admin,
      ip: getClientIp(request),
    });
    revalidateTag(storefrontCacheTags.devices);
    revalidateTag(storefrontCacheTags.products);
    return ok(result);
  },
);
