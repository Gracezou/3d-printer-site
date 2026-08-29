import Decimal from 'decimal.js';
import { and, count, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  materialStockMovements,
  materials,
  orderItems,
  orders,
  printJobs,
} from '@/lib/db/schema';
import type { BomSnapshotItem } from '@/lib/db/schema/order';
import { BizError } from '@/lib/errors';
import { toFixed2 } from '@/lib/money';
import {
  type DbTransaction,
  withAdminLog,
} from '@/lib/services/admin-log.service';
import type {
  PrintJobFailInput,
  PrintJobListQuery,
  PrintJobStartInput,
} from '@/lib/validators/production';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

interface JobMaterial {
  id: string;
  name: string;
  colorHex: string | null;
  requiredGrams: string;
  stockGrams: string;
  warning: boolean;
}

interface CurrentMaterial {
  id: string;
  name: string;
  colorHex: string | null;
  stockGrams: string;
}

function productionFilters(query: PrintJobListQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(printJobs.status, query.status));
  if (query.materialId) {
    filters.push(
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(${orderItems.bomSnapshot}) AS bom
        WHERE bom->>'material_id' = ${query.materialId}
      )`,
    );
  }
  return filters;
}

async function resolveMaterials(
  executor: ReturnType<typeof getDb> | DbTransaction,
  bomSnapshot: BomSnapshotItem[],
  quantity: number,
): Promise<JobMaterial[]> {
  const materialIds = [...new Set(bomSnapshot.map((item) => item.material_id))];
  if (!materialIds.length) return [];
  const rows = await executor
    .select({
      id: materials.id,
      name: materials.name,
      colorHex: materials.colorHex,
      stockGrams: materials.stockGrams,
    })
    .from(materials)
    .where(inArray(materials.id, materialIds));
  return mapMaterials(bomSnapshot, quantity, rows);
}

function mapMaterials(
  bomSnapshot: BomSnapshotItem[],
  quantity: number,
  rows: CurrentMaterial[],
): JobMaterial[] {
  const current = new Map(rows.map((row) => [row.id, row]));
  return bomSnapshot.map((item) => {
    const row = current.get(item.material_id);
    const requiredGrams = toFixed2(
      new Decimal(item.required_grams).mul(quantity),
    );
    const stockGrams = row?.stockGrams ?? '0.00';
    return {
      id: item.material_id,
      name: row?.name ?? item.material_name,
      colorHex: row?.colorHex ?? null,
      requiredGrams,
      stockGrams,
      warning: new Decimal(stockGrams).isNegative(),
    };
  });
}

export async function listPrintJobs(query: PrintJobListQuery) {
  const db = getDb();
  const filters = productionFilters(query);
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totals, currentMaterials] = await Promise.all([
    db
      .select({
        id: printJobs.id,
        orderId: printJobs.orderId,
        orderNo: orders.orderNo,
        orderCreatedAt: orders.createdAt,
        orderItemId: printJobs.orderItemId,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        imageUrl: orderItems.imageUrl,
        quantity: printJobs.quantity,
        status: printJobs.status,
        printerName: printJobs.printerName,
        failedCount: printJobs.failedCount,
        startedAt: printJobs.startedAt,
        finishedAt: printJobs.finishedAt,
        remark: printJobs.remark,
        createdAt: printJobs.createdAt,
        updatedAt: printJobs.updatedAt,
        bomSnapshot: orderItems.bomSnapshot,
      })
      .from(printJobs)
      .innerJoin(orders, eq(orders.id, printJobs.orderId))
      .innerJoin(orderItems, eq(orderItems.id, printJobs.orderItemId))
      .where(where)
      .orderBy(printJobs.createdAt)
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(printJobs)
      .innerJoin(orderItems, eq(orderItems.id, printJobs.orderItemId))
      .where(where),
    db
      .select({
        id: materials.id,
        name: materials.name,
        colorHex: materials.colorHex,
        stockGrams: materials.stockGrams,
      })
      .from(materials)
      .orderBy(materials.name),
  ]);
  const list = rows.map(({ bomSnapshot, ...row }) => ({
    ...row,
    materials: mapMaterials(bomSnapshot, row.quantity, currentMaterials),
  }));
  return {
    list,
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    materialOptions: currentMaterials.map(({ id, name, colorHex }) => ({
      id,
      name,
      colorHex,
    })),
  };
}

export async function startPrintJob(
  jobId: string,
  input: PrintJobStartInput,
  context: WriteContext,
) {
  return transitionJob(
    jobId,
    'queued',
    'printing',
    {
      printerName: input.printerName,
      assignedTo: context.admin.sub,
      startedAt: new Date(),
      finishedAt: null,
    },
    'production.start',
    context,
  );
}

export async function postProcessPrintJob(
  jobId: string,
  context: WriteContext,
) {
  return transitionJob(
    jobId,
    'printing',
    'post_processing',
    {},
    'production.post_process',
    context,
  );
}

async function transitionJob(
  jobId: string,
  expectedStatus: string,
  nextStatus: string,
  fields: Partial<typeof printJobs.$inferInsert>,
  action: string,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(printJobs)
        .set({ ...fields, status: nextStatus, updatedAt: new Date() })
        .where(
          and(eq(printJobs.id, jobId), eq(printJobs.status, expectedStatus)),
        )
        .returning();
      if (!updated) await throwJobTransitionError(tx, jobId);
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action,
      targetType: 'print_job',
      targetId: jobId,
      payload: fields,
      ip: context.ip,
    },
  );
}

export async function completePrintJob(jobId: string, context: WriteContext) {
  return withAdminLog(
    async (tx) => {
      const [job] = await tx
        .select({ orderId: printJobs.orderId })
        .from(printJobs)
        .where(eq(printJobs.id, jobId))
        .limit(1);
      if (!job) throw new BizError('NOT_FOUND', '生产任务不存在');
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${job.orderId}))`,
      );
      const now = new Date();
      const [updated] = await tx
        .update(printJobs)
        .set({ status: 'done', finishedAt: now, updatedAt: now })
        .where(
          and(eq(printJobs.id, jobId), eq(printJobs.status, 'post_processing')),
        )
        .returning();
      if (!updated) await throwJobTransitionError(tx, jobId);
      const [remaining] = await tx
        .select({ total: count() })
        .from(printJobs)
        .where(
          and(eq(printJobs.orderId, job.orderId), ne(printJobs.status, 'done')),
        );
      const orderReady = (remaining?.total ?? 0) === 0;
      if (orderReady) {
        await tx
          .update(orders)
          .set({ status: 'pending_shipment', updatedAt: now })
          .where(
            and(eq(orders.id, job.orderId), eq(orders.status, 'in_production')),
          );
      }
      return { ...updated, orderReady };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'production.done',
      targetType: 'print_job',
      targetId: jobId,
      ip: context.ip,
    },
  );
}

export async function failPrintJob(
  jobId: string,
  input: PrintJobFailInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(printJobs)
        .set({
          status: 'queued',
          failedCount: sql`${printJobs.failedCount} + 1`,
          printerName: null,
          assignedTo: null,
          startedAt: null,
          finishedAt: null,
          remark: input.remark,
          updatedAt: now,
        })
        .where(and(eq(printJobs.id, jobId), eq(printJobs.status, 'printing')))
        .returning({
          id: printJobs.id,
          quantity: printJobs.quantity,
          failedCount: printJobs.failedCount,
          orderItemId: printJobs.orderItemId,
        });
      if (!updated) await throwJobTransitionError(tx, jobId);
      await tx.execute(
        sql`SELECT fn_reprint_consume(${jobId}::uuid, ${context.admin.sub}::uuid)`,
      );
      const [item] = await tx
        .select({ bomSnapshot: orderItems.bomSnapshot })
        .from(orderItems)
        .where(eq(orderItems.id, updated.orderItemId))
        .limit(1);
      const deductions = await resolveMaterials(
        tx,
        item?.bomSnapshot ?? [],
        updated.quantity,
      );
      const movementCount = await tx
        .select({ total: count() })
        .from(materialStockMovements)
        .where(
          and(
            eq(materialStockMovements.refType, 'print_job'),
            eq(materialStockMovements.refId, jobId),
          ),
        );
      return {
        id: updated.id,
        status: 'queued' as const,
        failedCount: updated.failedCount,
        deductions,
        warning: deductions.some((material) => material.warning),
        movementCount: movementCount[0]?.total ?? 0,
      };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'production.fail',
      targetType: 'print_job',
      targetId: jobId,
      payload: { remark: input.remark },
      ip: context.ip,
    },
  );
}

async function throwJobTransitionError(
  tx: DbTransaction,
  jobId: string,
): Promise<never> {
  const [job] = await tx
    .select({ id: printJobs.id, status: printJobs.status })
    .from(printJobs)
    .where(eq(printJobs.id, jobId))
    .limit(1);
  if (!job) throw new BizError('NOT_FOUND', '生产任务不存在');
  throw new BizError(
    'ORDER_STATUS_INVALID',
    `生产任务当前状态 ${job.status} 不允许执行此操作`,
  );
}
