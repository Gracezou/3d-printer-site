import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  min,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  categories,
  materials,
  orderItems,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { withAdminLog } from '@/lib/services/admin-log.service';
import type {
  CreateProductInput,
  ProductListQuery,
  ProductStatus,
  ReplaceVariantsInput,
  UpdateProductInput,
} from '@/lib/validators/product';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function findDatabaseError(
  error: unknown,
): Record<string, unknown> | undefined {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const record = current as Record<string, unknown>;
    if ('code' in record) return record;
    current = record.cause;
  }
  return undefined;
}

function throwProductConstraintError(error: unknown): never {
  const databaseError = findDatabaseError(error);
  if (databaseError?.code === '23505') {
    const constraint = String(
      databaseError.constraint_name ?? databaseError.constraint ?? '',
    );
    throw new BizError(
      'PARAM_INVALID',
      constraint.includes('sku') ? 'SKU 编码已存在' : '商品 Slug 已存在',
    );
  }
  if (databaseError?.code === '23503') {
    throw new BizError('PARAM_INVALID', '分类或耗材不存在');
  }
  throw error;
}

export async function listProducts(query: ProductListQuery) {
  const db = getDb();
  const filters: SQL[] = [isNull(products.deletedAt)];
  if (query.keyword) {
    const keyword = `%${query.keyword}%`;
    filters.push(
      or(ilike(products.name, keyword), ilike(products.slug, keyword))!,
    );
  }
  if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));
  if (query.status) filters.push(eq(products.status, query.status));
  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;

  const [list, totalRows] = await Promise.all([
    db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        slug: products.slug,
        subtitle: products.subtitle,
        mainImageUrl: products.mainImageUrl,
        status: products.status,
        isFeatured: products.isFeatured,
        sortOrder: products.sortOrder,
        minPrice: products.minPrice,
        maxPrice: sql<
          string | null
        >`(SELECT max(pv.price) FROM ${productVariants} pv WHERE pv.product_id = ${products.id} AND pv.is_active = true)`.as(
          'max_price',
        ),
        variantCount:
          sql<number>`(SELECT count(*)::int FROM ${productVariants} pv WHERE pv.product_id = ${products.id})`.as(
            'variant_count',
          ),
        activeVariantCount:
          sql<number>`(SELECT count(*)::int FROM ${productVariants} pv WHERE pv.product_id = ${products.id} AND pv.is_active = true)`.as(
            'active_variant_count',
          ),
        soldCount: products.soldCount,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(desc(products.sortOrder), desc(products.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return {
    list,
    total: totalRows[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProductDetail(productId: string) {
  const db = getDb();
  const [product] = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
      name: products.name,
      slug: products.slug,
      subtitle: products.subtitle,
      description: products.description,
      mainImageUrl: products.mainImageUrl,
      gallery: products.gallery,
      modelPreviewUrl: products.modelPreviewUrl,
      specs: products.specs,
      status: products.status,
      isFeatured: products.isFeatured,
      sortOrder: products.sortOrder,
      minPrice: products.minPrice,
      soldCount: products.soldCount,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .limit(1);
  if (!product) throw new BizError('NOT_FOUND', '商品不存在');

  const [variantRows, bomRows] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        skuCode: productVariants.skuCode,
        name: productVariants.name,
        attributes: productVariants.attributes,
        price: productVariants.price,
        comparePrice: productVariants.comparePrice,
        weightGrams: productVariants.weightGrams,
        printHours: productVariants.printHours,
        imageUrl: productVariants.imageUrl,
        isActive: productVariants.isActive,
        sortOrder: productVariants.sortOrder,
        availableQty:
          sql<number>`COALESCE((SELECT available_qty FROM v_variant_availability WHERE variant_id = ${productVariants.id}), 0)`.as(
            'available_qty',
          ),
        createdAt: productVariants.createdAt,
        updatedAt: productVariants.updatedAt,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt)),
    db
      .select({
        id: variantMaterials.id,
        variantId: variantMaterials.variantId,
        materialId: variantMaterials.materialId,
        materialCode: materials.code,
        materialName: materials.name,
        materialActive: materials.isActive,
        grams: variantMaterials.grams,
        sortOrder: variantMaterials.sortOrder,
      })
      .from(variantMaterials)
      .innerJoin(materials, eq(materials.id, variantMaterials.materialId))
      .innerJoin(
        productVariants,
        eq(productVariants.id, variantMaterials.variantId),
      )
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.sortOrder), asc(variantMaterials.sortOrder)),
  ]);

  const bomByVariant = new Map<string, typeof bomRows>();
  for (const bom of bomRows) {
    const items = bomByVariant.get(bom.variantId) ?? [];
    items.push(bom);
    bomByVariant.set(bom.variantId, items);
  }

  return {
    ...product,
    variants: variantRows.map((variant) => ({
      ...variant,
      bom: bomByVariant.get(variant.id) ?? [],
    })),
  };
}

export async function createProduct(
  input: CreateProductInput,
  context: WriteContext,
) {
  try {
    const created = await withAdminLog(
      async (tx) => {
        const [record] = await tx
          .insert(products)
          .values({ ...input, status: 'draft' })
          .returning();
        if (!record) throw new BizError('INTERNAL_ERROR', '创建商品失败');
        return record;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'product.create',
        targetType: 'product',
        targetId: (record) => record.id,
        payload: { slug: input.slug },
        ip: context.ip,
      },
    );
    return created;
  } catch (error: unknown) {
    throwProductConstraintError(error);
  }
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [updated] = await tx
          .update(products)
          .set({ ...input, updatedAt: new Date() })
          .where(and(eq(products.id, productId), isNull(products.deletedAt)))
          .returning();
        if (!updated) throw new BizError('NOT_FOUND', '商品不存在');
        return updated;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'product.update',
        targetType: 'product',
        targetId: productId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwProductConstraintError(error);
  }
}

export async function deleteProduct(
  productId: string,
  context: WriteContext,
): Promise<{ id: string; deleted: true }> {
  return withAdminLog(
    async (tx) => {
      const [deleted] = await tx
        .update(products)
        .set({
          status: 'off_shelf',
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .returning({ id: products.id });
      if (!deleted) throw new BizError('NOT_FOUND', '商品不存在');
      return { id: deleted.id, deleted: true as const };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'product.delete',
      targetType: 'product',
      targetId: productId,
      ip: context.ip,
    },
  );
}

export async function updateProductStatus(
  productId: string,
  status: ProductStatus,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1)
        .for('update');
      if (!product) throw new BizError('NOT_FOUND', '商品不存在');

      if (status === 'on_sale') {
        const activeVariants = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isActive, true),
            ),
          );
        if (activeVariants.length === 0) {
          throw new BizError(
            'VARIANT_NO_BOM',
            '商品没有可启用的变体，无法上架',
          );
        }
        const [missingBom] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isActive, true),
              sql`NOT EXISTS (SELECT 1 FROM ${variantMaterials} vm WHERE vm.variant_id = ${productVariants.id})`,
            ),
          )
          .limit(1);
        if (missingBom) {
          throw new BizError(
            'VARIANT_NO_BOM',
            '存在未配置耗材的启用变体，无法上架',
          );
        }
      }

      const [updated] = await tx
        .update(products)
        .set({ status, updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning({ id: products.id, status: products.status });
      return updated!;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'product.status.update',
      targetType: 'product',
      targetId: productId,
      payload: { status },
      ip: context.ip,
    },
  );
}

export async function replaceProductVariants(
  productId: string,
  input: ReplaceVariantsInput,
  context: WriteContext,
) {
  for (const variant of input.variants) {
    if (variant.isActive && variant.bom.length === 0) {
      throw new BizError(
        'VARIANT_NO_BOM',
        `启用变体“${variant.name}”必须至少配置一种耗材`,
      );
    }
  }

  try {
    await withAdminLog(
      async (tx) => {
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, productId), isNull(products.deletedAt)))
          .limit(1)
          .for('update');
        if (!product) throw new BizError('NOT_FOUND', '商品不存在');

        const existing = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.productId, productId));
        const existingIds = new Set(existing.map((variant) => variant.id));
        const inputIds = input.variants.flatMap((variant) =>
          variant.id ? [variant.id] : [],
        );
        if (inputIds.some((id) => !existingIds.has(id))) {
          throw new BizError('PARAM_INVALID', '变体不存在或不属于当前商品');
        }

        const materialIds = [
          ...new Set(
            input.variants.flatMap((variant) =>
              variant.bom.map((item) => item.materialId),
            ),
          ),
        ];
        if (materialIds.length > 0) {
          const materialRows = await tx
            .select({ id: materials.id })
            .from(materials)
            .where(inArray(materials.id, materialIds));
          if (materialRows.length !== materialIds.length) {
            throw new BizError('PARAM_INVALID', 'BOM 中包含不存在的耗材');
          }
        }

        const omittedIds = existing
          .map((variant) => variant.id)
          .filter((id) => !inputIds.includes(id));
        let referencedIds = new Set<string>();
        if (omittedIds.length > 0) {
          const references = await tx
            .selectDistinct({ id: orderItems.variantId })
            .from(orderItems)
            .where(inArray(orderItems.variantId, omittedIds));
          referencedIds = new Set(
            references.flatMap((reference) =>
              reference.id ? [reference.id] : [],
            ),
          );
        }

        if (inputIds.length > 0) {
          for (const id of inputIds) {
            await tx
              .update(productVariants)
              .set({ skuCode: `__tmp__${id}`, updatedAt: new Date() })
              .where(eq(productVariants.id, id));
          }
        }
        const deletableIds = omittedIds.filter((id) => !referencedIds.has(id));
        const retainedIds = omittedIds.filter((id) => referencedIds.has(id));
        if (deletableIds.length > 0) {
          await tx
            .delete(productVariants)
            .where(inArray(productVariants.id, deletableIds));
        }
        if (retainedIds.length > 0) {
          await tx
            .update(productVariants)
            .set({ isActive: false, updatedAt: new Date() })
            .where(inArray(productVariants.id, retainedIds));
        }

        for (const [index, variant] of input.variants.entries()) {
          const values = {
            skuCode: variant.skuCode,
            name: variant.name,
            attributes: variant.attributes,
            price: variant.price,
            comparePrice: variant.comparePrice ?? null,
            weightGrams: variant.weightGrams,
            printHours: variant.printHours ?? null,
            imageUrl: variant.imageUrl ?? null,
            isActive: variant.isActive,
            sortOrder: variant.sortOrder ?? index,
            updatedAt: new Date(),
          };
          let variantId: string;
          if (variant.id) {
            await tx
              .update(productVariants)
              .set(values)
              .where(eq(productVariants.id, variant.id));
            variantId = variant.id;
            await tx
              .delete(variantMaterials)
              .where(eq(variantMaterials.variantId, variantId));
          } else {
            const [created] = await tx
              .insert(productVariants)
              .values({ productId, ...values })
              .returning({ id: productVariants.id });
            if (!created) throw new BizError('INTERNAL_ERROR', '创建变体失败');
            variantId = created.id;
          }
          if (variant.bom.length > 0) {
            await tx.insert(variantMaterials).values(
              variant.bom.map((item, bomIndex) => ({
                variantId,
                materialId: item.materialId,
                grams: item.grams,
                sortOrder: bomIndex,
              })),
            );
          }
        }

        const [price] = await tx
          .select({ value: min(productVariants.price) })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isActive, true),
            ),
          );
        await tx
          .update(products)
          .set({ minPrice: price?.value ?? null, updatedAt: new Date() })
          .where(eq(products.id, productId));
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'product.variants.replace',
        targetType: 'product',
        targetId: productId,
        payload: { variantCount: input.variants.length },
        ip: context.ip,
      },
    );
    return await getProductDetail(productId);
  } catch (error: unknown) {
    throwProductConstraintError(error);
  }
}
