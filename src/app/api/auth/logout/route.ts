import { logoutCustomer } from '@/lib/auth/customer';
import { ok, withErrorHandler } from '@/lib/api-response';

export const POST = withErrorHandler(async () => {
  await logoutCustomer();
  return ok({ loggedOut: true });
});
