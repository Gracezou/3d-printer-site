import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, withErrorHandler } from '@/lib/api-response';
import { postProcessPrintJob } from '@/lib/services/production.service';
import { printJobIdSchema } from '@/lib/validators/production';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('production:update');
    const jobId = printJobIdSchema.parse((await params).id);
    return ok(
      await postProcessPrintJob(jobId, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
