import { ok, withErrorHandler } from '@/lib/api-response';
import { getPublicByProductSlug } from '@/lib/services/availability.service';
import { finishServerTiming } from '@/lib/server-timing';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (_request: Request, context: RouteContext) => {
    const startedAt = performance.now();
    const { slug } = await context.params;
    const variants = await getPublicByProductSlug(slug);
    const response = ok({ variants });
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, max-age=0',
    );
    return finishServerTiming(response, 'product_availability', startedAt);
  },
);
