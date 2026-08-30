import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCronAuthorization } from '@/lib/auth/cron';
import { releaseExpiredOrders } from '@/lib/services/cron.service';

export const GET = withErrorHandler(async (request: Request) => {
  requireCronAuthorization(request);
  return ok({ processed: await releaseExpiredOrders() });
});
