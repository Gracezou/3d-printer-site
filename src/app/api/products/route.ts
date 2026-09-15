import { ok, parseSearchParams, withErrorHandler } from '@/lib/api-response';
import { finishServerTiming } from '@/lib/server-timing';
import { listStorefrontProducts } from '@/lib/services/storefront.service';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';

export const GET = withErrorHandler(async (request: Request) => {
  const startedAt = performance.now();
  const query = parseSearchParams(request, storefrontProductListQuerySchema);
  const response = finishServerTiming(
    ok(await listStorefrontProducts(query)),
    'product_list',
    startedAt,
  );
  response.headers.set(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=300',
  );
  return response;
});
