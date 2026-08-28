import { ok, withErrorHandler } from '@/lib/api-response';
import { listCategories } from '@/lib/services/category.service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () =>
  ok(await listCategories({ visibleOnly: true })),
);
