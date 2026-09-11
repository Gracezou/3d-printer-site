import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { searchPublicDevices } from '@/lib/services/device.service';
import { deviceSearchSchema } from '@/lib/validators/device';

export const GET = withErrorHandler(async (request: Request) => {
  const query = parseSearchParams(request, deviceSearchSchema);
  return ok(await searchPublicDevices(query.q));
});
