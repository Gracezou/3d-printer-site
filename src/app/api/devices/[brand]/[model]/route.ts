import { ok, withErrorHandler } from '@/lib/api-response';
import { getPublicDeviceDetail } from '@/lib/services/device.service';
import { devicePathSchema } from '@/lib/validators/device';

interface DeviceRouteContext {
  params: Promise<{ brand: string; model: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: DeviceRouteContext) => {
    const path = devicePathSchema.parse(await params);
    return ok(await getPublicDeviceDetail(path.brand, path.model));
  },
);
