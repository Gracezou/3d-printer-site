import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { startPrintJob } from '@/lib/services/production.service';
import {
  printJobIdSchema,
  printJobStartSchema,
} from '@/lib/validators/production';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: RouteContext) => {
    const admin = await requirePermission('production:update');
    const jobId = printJobIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, printJobStartSchema);
    return ok(
      await startPrintJob(jobId, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
