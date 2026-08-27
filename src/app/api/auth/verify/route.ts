import { verifyPhoneCode } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { verifyCodeSchema } from '@/lib/validators/auth';

export const POST = withErrorHandler(async (request: Request) => {
  const input = await parseJsonBody(request, verifyCodeSchema);
  const customer = await verifyPhoneCode(input.phone, input.code);
  return ok({
    userId: customer.id,
    phone: customer.phone,
    nickname: customer.nickname,
    isNewUser: customer.isNewUser,
  });
});
