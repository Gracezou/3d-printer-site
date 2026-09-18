import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import {
  materials,
  orders,
  payments,
  returnRequests,
  settings,
} from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { releaseDiscount } from '@/lib/services/promotion.service';
import {
  getReturnEvidencePublicUrl,
  listReturnEvidenceObjects,
  removeReturnEvidenceObjects,
  type ReturnEvidenceObject,
} from '@/lib/services/upload.service';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_AUTO_COMPLETE_DAYS = 15;
const RETURN_EVIDENCE_ORPHAN_GRACE_MS = 24 * 60 * 60_000;

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export async function releaseExpiredOrders(
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const limit = Math.min(positiveInteger(batchSize, DEFAULT_BATCH_SIZE), 100);
  const processed = await getDb().transaction(async (tx) => {
    const expired = await tx
      .select({ id: orders.id, orderNo: orders.orderNo })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'pending_payment'),
          lt(orders.reservedUntil, now),
        ),
      )
      .orderBy(asc(orders.reservedUntil), asc(orders.id))
      .limit(limit)
      .for('update', { skipLocked: true });

    let count = 0;
    for (const order of expired) {
      const [cancelled] = await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelReason: 'payment_timeout',
          cancelledAt: now,
          reservedUntil: null,
          updatedAt: now,
        })
        .where(
          and(eq(orders.id, order.id), eq(orders.status, 'pending_payment')),
        )
        .returning({ id: orders.id });
      if (!cancelled) continue;
      await tx.execute(sql`SELECT fn_release_order_stock(${order.id}::uuid)`);
      await releaseDiscount(tx, order.id);
      await tx
        .update(payments)
        .set({ status: 'closed', updatedAt: now })
        .where(
          and(
            eq(payments.orderId, order.id),
            inArray(payments.status, ['created', 'pending']),
          ),
        );
      count += 1;
    }
    return count;
  });
  logger.info({ processed, batchSize: limit }, 'Expired orders released');
  return processed;
}

export async function autoCompleteShippedOrders(
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const limit = Math.min(positiveInteger(batchSize, DEFAULT_BATCH_SIZE), 100);
  const processed = await getDb().transaction(async (tx) => {
    const [setting] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'auto_complete_days'))
      .limit(1);
    const days = positiveInteger(setting?.value, DEFAULT_AUTO_COMPLETE_DAYS);
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const candidates = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'shipped'), lt(orders.shippedAt, cutoff)))
      .orderBy(asc(orders.shippedAt), asc(orders.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (!candidates.length) return 0;
    const completed = await tx
      .update(orders)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(
        and(
          inArray(
            orders.id,
            candidates.map((order) => order.id),
          ),
          eq(orders.status, 'shipped'),
        ),
      )
      .returning({ id: orders.id });
    return completed.length;
  });
  logger.info({ processed, batchSize: limit }, 'Shipped orders auto-completed');
  return processed;
}

export async function collectLowStockAlert(now = new Date()) {
  const lowStockMaterials = await getDb()
    .select({
      id: materials.id,
      code: materials.code,
      name: materials.name,
      availableGrams:
        sql<string>`${materials.stockGrams} - ${materials.reservedGrams}`.as(
          'available_grams',
        ),
      safetyGrams: materials.safetyGrams,
    })
    .from(materials)
    .where(
      sql`${materials.stockGrams} - ${materials.reservedGrams} <= ${materials.safetyGrams}`,
    )
    .orderBy(materials.name);

  await getDb()
    .insert(settings)
    .values({
      key: 'low_stock_alert_snapshot',
      value: {
        generatedAt: now.toISOString(),
        materials: lowStockMaterials,
      },
      remark: '低库存定时任务最近一次汇总',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: {
          generatedAt: now.toISOString(),
          materials: lowStockMaterials,
        },
        remark: '低库存定时任务最近一次汇总',
        updatedAt: now,
      },
    });
  logger.warn(
    { processed: lowStockMaterials.length, materials: lowStockMaterials },
    'Low stock alert collected',
  );
  return lowStockMaterials;
}

interface ReturnEvidenceCleanupDependencies {
  listObjects?: (maxFiles: number) => Promise<ReturnEvidenceObject[]>;
  publicUrl?: (path: string) => string;
  removeObjects?: (paths: string[]) => Promise<void>;
}

export async function cleanupOrphanReturnEvidence(
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  dependencies: ReturnEvidenceCleanupDependencies = {},
): Promise<number> {
  const limit = Math.min(positiveInteger(batchSize, DEFAULT_BATCH_SIZE), 100);
  const listObjects = dependencies.listObjects ?? listReturnEvidenceObjects;
  const publicUrl = dependencies.publicUrl ?? getReturnEvidencePublicUrl;
  const removeObjects = dependencies.removeObjects ?? removeReturnEvidenceObjects;
  const cutoff = now.getTime() - RETURN_EVIDENCE_ORPHAN_GRACE_MS;
  const candidates = (await listObjects(limit)).filter(
    (object) => object.createdAt && object.createdAt.getTime() < cutoff,
  );
  if (!candidates.length) return 0;

  const urlByPath = new Map(
    candidates.map((object) => [object.path, publicUrl(object.path)]),
  );
  const candidateUrls = new Set(urlByPath.values());
  const candidateUrlSql = sql.join(
    [...candidateUrls].map((url) => sql`${url}`),
    sql`, `,
  );
  const referencedRows = await getDb()
    .select({ images: returnRequests.images })
    .from(returnRequests)
    .where(sql`${returnRequests.images} ?| ARRAY[${candidateUrlSql}]::text[]`);
  const referenced = new Set(
    referencedRows.flatMap((row) =>
      row.images.filter((url) => candidateUrls.has(url)),
    ),
  );
  const orphanPaths = candidates
    .filter((object) => !referenced.has(urlByPath.get(object.path)!))
    .map((object) => object.path);
  await removeObjects(orphanPaths);
  logger.info(
    { scanned: candidates.length, removed: orphanPaths.length },
    'Orphan return evidence cleaned up',
  );
  return orphanPaths.length;
}
