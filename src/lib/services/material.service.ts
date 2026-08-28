import Decimal from 'decimal.js';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  materialStockMovements,
  materials,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { withAdminLog } from '@/lib/services/admin-log.service';
import type {
  AdjustMaterialInput,
  CreateMaterialInput,
  MaterialListQuery,
  MovementListQuery,
  StockInInput,
  UpdateMaterialInput,
} from '@/lib/validators/material';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function throwMaterialCodeConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new BizError('PARAM_INVALID', '耗材编码已存在');
  }
  throw error;
}

export async function listMaterials(query: MaterialListQuery) {
  const db = getDb();
  const filters: SQL[] = [];
  if (query.keyword) {
    const keyword = `%${query.keyword}%`;
    filters.push(
      or(ilike(materials.code, keyword), ilike(materials.name, keyword))!,
    );
  }
  if (query.type) {
    filters.push(eq(materials.materialType, query.type));
  }
  const isLowStockExpression = sql<boolean>`(${materials.stockGrams} - ${materials.reservedGrams}) <= ${materials.safetyGrams}`;
  if (query.lowStockOnly) {
    filters.push(isLowStockExpression);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [list, totalRows] = await Promise.all([
    db
      .select({
        id: materials.id,
        code: materials.code,
        name: materials.name,
        materialType: materials.materialType,
        colorName: materials.colorName,
        colorHex: materials.colorHex,
        brand: materials.brand,
        spec: materials.spec,
        unitCostPerKg: materials.unitCostPerKg,
        stockGrams: materials.stockGrams,
        reservedGrams: materials.reservedGrams,
        safetyGrams: materials.safetyGrams,
        availableGrams:
          sql<string>`${materials.stockGrams} - ${materials.reservedGrams} - ${materials.safetyGrams}`.as(
            'available_grams',
          ),
        wasteRate: materials.wasteRate,
        isActive: materials.isActive,
        supplier: materials.supplier,
        remark: materials.remark,
        isLowStock: isLowStockExpression.as('is_low_stock'),
        usedByVariantCount:
          sql<number>`(SELECT count(*)::int FROM ${variantMaterials} vm WHERE vm.material_id = ${materials.id})`.as(
            'used_by_variant_count',
          ),
        createdAt: materials.createdAt,
        updatedAt: materials.updatedAt,
      })
      .from(materials)
      .where(where)
      .orderBy(desc(isLowStockExpression), desc(materials.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(materials).where(where),
  ]);

  return {
    list,
    total: totalRows[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createMaterial(
  input: CreateMaterialInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [created] = await tx.insert(materials).values(input).returning();
        if (!created) {
          throw new BizError('INTERNAL_ERROR', '创建耗材失败');
        }
        return created;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'material.create',
        targetType: 'material',
        targetId: (created) => created.id,
        payload: { code: input.code },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwMaterialCodeConflict(error);
  }
}

export async function updateMaterial(
  materialId: string,
  input: UpdateMaterialInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [updated] = await tx
          .update(materials)
          .set(input)
          .where(eq(materials.id, materialId))
          .returning();
        if (!updated) {
          throw new BizError('NOT_FOUND', '耗材不存在');
        }
        return updated;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'material.update',
        targetType: 'material',
        targetId: materialId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwMaterialCodeConflict(error);
  }
}

export async function stockInMaterial(
  materialId: string,
  input: StockInInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [material] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, materialId))
        .limit(1)
        .for('update');
      if (!material) {
        throw new BizError('NOT_FOUND', '耗材不存在');
      }

      const stockAfter = new Decimal(material.stockGrams)
        .add(input.grams)
        .toFixed(2);
      await tx
        .update(materials)
        .set({ stockGrams: stockAfter, unitCostPerKg: input.unitCostPerKg })
        .where(eq(materials.id, materialId));
      const [movement] = await tx
        .insert(materialStockMovements)
        .values({
          materialId,
          movementType: 'purchase_in',
          deltaStockGrams: new Decimal(input.grams).toFixed(2),
          deltaReservedGrams: '0',
          stockAfter,
          reservedAfter: material.reservedGrams,
          refType: 'manual',
          batchNo: input.batchNo,
          unitCostPerKg: input.unitCostPerKg,
          operatorType: 'admin',
          operatorId: context.admin.sub,
          remark: input.remark,
        })
        .returning();
      return { materialId, stockGrams: stockAfter, movement };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'material.stock_in',
      targetType: 'material',
      targetId: materialId,
      payload: { grams: input.grams, batchNo: input.batchNo },
      ip: context.ip,
    },
  );
}

export async function adjustMaterialStock(
  materialId: string,
  input: AdjustMaterialInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [material] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, materialId))
        .limit(1)
        .for('update');
      if (!material) {
        throw new BizError('NOT_FOUND', '耗材不存在');
      }

      const stockAfter = new Decimal(input.targetGrams).toFixed(2);
      const delta = new Decimal(stockAfter).sub(material.stockGrams).toFixed(2);
      await tx
        .update(materials)
        .set({ stockGrams: stockAfter })
        .where(eq(materials.id, materialId));
      const [movement] = await tx
        .insert(materialStockMovements)
        .values({
          materialId,
          movementType: 'adjust',
          deltaStockGrams: delta,
          deltaReservedGrams: '0',
          stockAfter,
          reservedAfter: material.reservedGrams,
          refType: 'manual',
          operatorType: 'admin',
          operatorId: context.admin.sub,
          remark: input.remark,
        })
        .returning();
      return {
        materialId,
        stockGrams: stockAfter,
        deltaStockGrams: delta,
        movement,
      };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'material.adjust',
      targetType: 'material',
      targetId: materialId,
      payload: { targetGrams: input.targetGrams, remark: input.remark },
      ip: context.ip,
    },
  );
}

export async function toggleMaterial(
  materialId: string,
  isActive: boolean,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(materials)
        .set({ isActive })
        .where(eq(materials.id, materialId))
        .returning({ id: materials.id, isActive: materials.isActive });
      if (!updated) {
        throw new BizError('NOT_FOUND', '耗材不存在');
      }
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'material.toggle',
      targetType: 'material',
      targetId: materialId,
      payload: { isActive },
      ip: context.ip,
    },
  );
}

export async function listMaterialMovements(
  materialId: string,
  query: MovementListQuery,
) {
  const db = getDb();
  const materialExists = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);
  if (materialExists.length === 0) {
    throw new BizError('NOT_FOUND', '耗材不存在');
  }

  const filters: SQL[] = [eq(materialStockMovements.materialId, materialId)];
  if (query.type) {
    filters.push(eq(materialStockMovements.movementType, query.type));
  }
  if (query.startDate) {
    filters.push(
      gte(materialStockMovements.createdAt, new Date(query.startDate)),
    );
  }
  if (query.endDate) {
    filters.push(
      lte(materialStockMovements.createdAt, new Date(query.endDate)),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;
  const [list, totalRows] = await Promise.all([
    db
      .select()
      .from(materialStockMovements)
      .where(where)
      .orderBy(desc(materialStockMovements.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(materialStockMovements).where(where),
  ]);
  return {
    list,
    total: totalRows[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listMaterialVariants(materialId: string) {
  const db = getDb();
  const materialExists = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1);
  if (materialExists.length === 0) {
    throw new BizError('NOT_FOUND', '耗材不存在');
  }

  const list = await db
    .select({
      variantId: productVariants.id,
      skuCode: productVariants.skuCode,
      variantName: productVariants.name,
      productId: products.id,
      productName: products.name,
      grams: variantMaterials.grams,
      isActive: productVariants.isActive,
      availableQty:
        sql<number>`COALESCE((SELECT available_qty FROM v_variant_availability WHERE variant_id = ${productVariants.id}), 0)`.as(
          'available_qty',
        ),
    })
    .from(variantMaterials)
    .innerJoin(
      productVariants,
      eq(productVariants.id, variantMaterials.variantId),
    )
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(variantMaterials.materialId, materialId))
    .orderBy(asc(products.name), asc(productVariants.sortOrder));

  return { list, total: list.length };
}
