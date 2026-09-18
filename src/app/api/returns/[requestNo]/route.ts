import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { getCustomerReturnRequest } from '@/lib/services/return-request.service';
import { returnRequestNoSchema } from '@/lib/validators/return-request';

interface Context {
  params: Promise<{ requestNo: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: Context) => {
    const customer = await requireCustomer();
    const requestNo = returnRequestNoSchema.parse((await params).requestNo);
    return ok(await getCustomerReturnRequest(customer.id, requestNo));
  },
);
