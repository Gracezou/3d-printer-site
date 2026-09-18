import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import {
  createReturnRequest,
  listCustomerReturnRequests,
} from '@/lib/services/return-request.service';
import {
  createReturnRequestSchema,
  customerReturnListQuerySchema,
} from '@/lib/validators/return-request';

export const GET = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  return ok(
    await listCustomerReturnRequests(
      customer.id,
      parseSearchParams(request, customerReturnListQuerySchema),
    ),
  );
});

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  return ok(
    await createReturnRequest(
      customer.id,
      await parseJsonBody(request, createReturnRequestSchema),
    ),
    { status: 201 },
  );
});
