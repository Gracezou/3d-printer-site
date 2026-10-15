import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCronAuthorization } from '@/lib/auth/cron';
import {
  assertBusinessMailReady,
  dispatchBusinessEmails,
  enqueueEligibleModelEmails,
} from '@/lib/services/business-email.service';

export const GET = withErrorHandler(async (request: Request) => {
  requireCronAuthorization(request);
  if (!assertBusinessMailReady()) {
    return ok({
      queued: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      unknown: 0,
      disabled: true,
    });
  }
  const queued = await enqueueEligibleModelEmails();
  const delivery = await dispatchBusinessEmails();
  return ok({ queued, ...delivery });
});
