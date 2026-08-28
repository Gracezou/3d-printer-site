import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { removeAddress, updateAddress } from '@/lib/services/address.service';
import { addressIdSchema, addressInputSchema } from '@/lib/validators/address';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandler(
  async (request: Request, context: RouteContext) => {
    const customer = await requireCustomer();
    const { id } = await context.params;
    const input = await parseJsonBody(request, addressInputSchema);
    return ok(
      await updateAddress(customer.id, addressIdSchema.parse(id), input),
    );
  },
);

export const DELETE = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const customer = await requireCustomer();
    const { id } = await context.params;
    await removeAddress(customer.id, addressIdSchema.parse(id));
    return ok({ deleted: true });
  },
);
