import { ok, withErrorHandler } from '@/lib/api-response';
import { getByProductId } from '@/lib/services/availability.service';
import { getStorefrontProductBySlug } from '@/lib/services/storefront.service';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const { slug } = await context.params;
    const product = await getStorefrontProductBySlug(slug);
    const publicVariantIds = new Set(
      product.variants.map((variant) => variant.id),
    );
    const variants = (await getByProductId(product.id)).filter((variant) =>
      publicVariantIds.has(variant.variantId),
    );
    const response = ok({ variants });
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, max-age=0',
    );
    return response;
  },
);
