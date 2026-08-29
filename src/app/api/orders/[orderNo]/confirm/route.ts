import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { confirmCustomerOrder } from '@/lib/services/customer-order.service';
import { customerOrderNoSchema } from '@/lib/validators/order';

interface RouteContext {
  params: Promise<{ orderNo: string }>;
}

export const POST = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    const customer = await requireCustomer();
    const orderNo = customerOrderNoSchema.parse((await params).orderNo);
    return ok(await confirmCustomerOrder(customer.id, orderNo));
  },
);
