import { ok, parseJsonBody, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { createAddress, listAddresses } from '@/lib/services/address.service';
import { addressInputSchema } from '@/lib/validators/address';

export const GET = withErrorHandler(async () => {
  const customer = await requireCustomer();
  return ok({ addresses: await listAddresses(customer.id) });
});

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  const input = await parseJsonBody(request, addressInputSchema);
  return ok(await createAddress(customer.id, input), { status: 201 });
});
