import { getClientIp } from '@/lib/auth/request';
import { sendPhoneCode } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { sendCodeSchema } from '@/lib/validators/auth';

export const POST = withErrorHandler(async (request: Request) => {
  const input = await parseJsonBody(request, sendCodeSchema);
  await sendPhoneCode(input.phone, getClientIp(request));
  return ok({ sent: true });
});
