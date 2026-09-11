import { ok, withErrorHandler } from '@/lib/api-response';
import { getPublicDeviceCatalog } from '@/lib/services/device.service';

export const GET = withErrorHandler(async () =>
  ok(await getPublicDeviceCatalog()),
);
