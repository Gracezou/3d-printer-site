import { ok, withErrorHandler } from '@/lib/api-response';
import { getStorefrontProductBySlug } from '@/lib/services/storefront.service';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const GET = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const { slug } = await context.params;
    const product = await getStorefrontProductBySlug(slug);
    const response = ok({
      id: product.id,
      name: product.name,
      slug: product.slug,
      subtitle: product.subtitle,
      description: product.description,
      mainImageUrl: product.mainImageUrl,
      gallery: product.gallery,
      modelPreviewUrl: product.modelPreviewUrl,
      specs: product.specs,
      variants: product.variants,
    });
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    return response;
  },
);
