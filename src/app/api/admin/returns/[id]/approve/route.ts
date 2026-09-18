import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { approveReturnRequest } from '@/lib/services/return-request.service';
import {
  approveReturnRequestSchema,
  returnRequestIdSchema,
} from '@/lib/validators/return-request';

interface Context {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (request: Request, { params }: Context) => {
    const admin = await requirePermission('return:review');
    const id = returnRequestIdSchema.parse((await params).id);
    const input = await parseJsonBody(request, approveReturnRequestSchema);
    return ok(
      await approveReturnRequest(id, input, {
        admin,
        ip: getClientIp(request),
      }),
    );
  },
);
