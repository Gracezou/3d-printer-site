import { requireCustomer } from '@/lib/auth/customer';
import { ok, withErrorHandler } from '@/lib/api-response';

export const GET = withErrorHandler(async () => {
  const customer = await requireCustomer();
  return ok({
    userId: customer.id,
    phone: customer.phone,
    nickname: customer.nickname,
    avatarUrl: customer.avatarUrl,
  });
});
