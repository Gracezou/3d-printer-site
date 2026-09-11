import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { consumeModelRequestRateLimit } from '@/lib/model-request-rate-limit';
import { createModelRequest } from '@/lib/services/device.service';
import { modelRequestSchema } from '@/lib/validators/device';

export const POST = withErrorHandler(async (request: Request) => {
  const input = await parseJsonBody(request, modelRequestSchema);
  consumeModelRequestRateLimit(getClientIp(request));
  return ok(await createModelRequest(input), { status: 201 });
});
