import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { getCustomerOrderDetail } from '@/lib/services/customer-order.service';
import { customerOrderNoSchema } from '@/lib/validators/order';

interface RouteContext {
  params: Promise<{ orderNo: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, { params }: RouteContext) => {
    const customer = await requireCustomer();
    const orderNo = customerOrderNoSchema.parse((await params).orderNo);
    return ok(await getCustomerOrderDetail(customer.id, orderNo));
  },
);
