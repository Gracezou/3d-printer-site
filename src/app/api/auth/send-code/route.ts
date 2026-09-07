import { getClientIp } from '@/lib/auth/request';
import { sendEmailCode } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { sendCodeSchema } from '@/lib/validators/auth';

export const POST = withErrorHandler(async (request: Request) => {
  const input = await parseJsonBody(request, sendCodeSchema);
  await sendEmailCode(input.email, getClientIp(request));
  return ok({ sent: true });
});
