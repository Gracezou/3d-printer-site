import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { listStorefrontProducts } from '@/lib/services/storefront.service';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';

export const GET = withErrorHandler(async (request: Request) => {
  const query = parseSearchParams(request, storefrontProductListQuerySchema);
  const response = ok(await listStorefrontProducts(query));
  response.headers.set(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=300',
  );
  return response;
});
