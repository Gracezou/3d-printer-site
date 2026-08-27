import { clearAdminSession, requireAdmin } from '@/lib/auth/admin';
import { ok, withErrorHandler } from '@/lib/api-response';

export const POST = withErrorHandler(async () => {
  await requireAdmin();
  await clearAdminSession();
  return ok({ loggedOut: true });
});
