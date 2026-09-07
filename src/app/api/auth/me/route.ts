import { requireCustomer, updateCustomerProfile } from '@/lib/auth/customer';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { customerProfileSchema } from '@/lib/validators/auth';

export const GET = withErrorHandler(async () => {
  const customer = await requireCustomer();
  return ok({
    userId: customer.id,
    email: customer.email,
    phone: customer.phone,
    phoneVerified: Boolean(customer.phoneVerifiedAt),
    nickname: customer.nickname,
    avatarUrl: customer.avatarUrl,
  });
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, customerProfileSchema);
  const updated = await updateCustomerProfile(customer.id, input);
  return ok({
    userId: updated.id,
    email: updated.email,
    phone: updated.phone,
    phoneVerified: Boolean(updated.phoneVerifiedAt),
    nickname: updated.nickname,
    avatarUrl: updated.avatarUrl,
  });
});
