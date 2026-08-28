import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { setDefaultAddress } from '@/lib/services/address.service';
import { addressIdSchema } from '@/lib/validators/address';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const customer = await requireCustomer();
    const { id } = await context.params;
    return ok(await setDefaultAddress(customer.id, addressIdSchema.parse(id)));
  },
);
