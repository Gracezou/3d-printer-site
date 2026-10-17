import { and, asc, eq, inArray, isNull, min, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  materials,
  products,
  productStyles,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { materialColorLabels, mergeColorwayBom } from '@/lib/style-colorways';
import type { ColorMaterial } from '@/lib/style-colorways';
import { withAdminLog, type DbTransaction } from './admin-log.service';
import type { AdminIdentity } from '@/lib/auth/admin';
import type { ReplaceProductStylesInput } from '@/lib/validators/product-style';
import { getProductDetail } from './product.service';

export async function lockStyleCatalog(
  tx: DbTransaction,
  extraProductId?: string,
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(227, 1)`);
  // Match checkout's product -> material order before any material row is changed.
  await tx.execute(
    sql`SELECT id FROM products WHERE id IN (SELECT product_id FROM product_styles) ${extraProductId ? sql`OR id = ${extraProductId}::uuid` : sql``} ORDER BY id FOR UPDATE`,
  );
}

export async function listProductMaterialOptions() {
  return getDb()
    .select({
      id: materials.id,
      code: materials.code,
      name: materials.name,
      materialType: materials.materialType,
      brand: materials.brand,
      colorName: materials.colorName,
      colorHex: materials.colorHex,
      isActive: materials.isActive,
      stockGrams: materials.stockGrams,
      reservedGrams: materials.reservedGrams,
      safetyGrams: materials.safetyGrams,
      availableGrams: sql<string>`${materials.stockGrams} - ${materials.reservedGrams} - ${materials.safetyGrams}`,
    })
    .from(materials)
    .orderBy(
      asc(materials.materialType),
      asc(materials.colorName),
      asc(materials.code),
    );
}

async function refreshProductPrice(tx: DbTransaction, productId: string) {
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
}

async function syncStyleSingles(
  tx: DbTransaction,
  style: typeof productStyles.$inferSelect,
  materialRows: ColorMaterial[],
  desiredManualNames?: string[],
) {
  const existing = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.styleId, style.id));
  const byMaterial = new Map(
    existing
      .filter((v) => v.sourceMaterialId)
      .map((v) => [v.sourceMaterialId!, v]),
  );
  const labels = materialColorLabels(
    materialRows.filter((m) => m.colorName?.trim()),
  );
  const manualNames = new Set(
    desiredManualNames ??
      existing
        .filter((v) => !v.sourceMaterialId)
        .map((v) => v.attributes.color),
  );
  const wanted = materialRows.filter(
    (m) =>
      m.colorName?.trim() &&
      (style.singleMaterialMode === 'all' ||
        (style.singleMaterialMode === 'selected' &&
          style.materialIds.includes(m.id))),
  );
  const wantedIds = new Set(wanted.map((m) => m.id));
  for (const variant of existing) {
    if (variant.sourceMaterialId && !wantedIds.has(variant.sourceMaterialId))
      await tx
        .update(productVariants)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(productVariants.id, variant.id));
  }
  for (const [index, material] of wanted.entries()) {
    const old = byMaterial.get(material.id);
    if (!old && !material.isActive) continue;
    const id = old?.id ?? crypto.randomUUID();
    let color = labels.get(material.id)!;
    while (manualNames.has(color)) color += '（单色）';
    const values = {
      productId: style.productId,
      styleId: style.id,
      sourceMaterialId: material.id,
      name: `${style.name} / ${color}`.slice(0, 150),
      attributes: { style: style.name, color },
      price: style.price,
      weightGrams: style.weightGrams,
      printHours: style.printHours,
      isActive: style.isActive && material.isActive,
      sortOrder: style.sortOrder * 3000 + index,
      updatedAt: new Date(),
    };
    if (old)
      await tx
        .update(productVariants)
        .set(values)
        .where(eq(productVariants.id, id));
    else
      await tx
        .insert(productVariants)
        .values({ ...values, id, skuCode: `SC-${id}` });
    await tx.delete(variantMaterials).where(eq(variantMaterials.variantId, id));
    await tx.insert(variantMaterials).values({
      variantId: id,
      materialId: material.id,
      grams: style.materialGrams,
    });
  }
}

// All material writers and style writers serialize through product rows in UUID order.
// The second read after acquiring locks sees styles committed while this writer waited.
export async function syncMaterialProductStyles(tx: DbTransaction) {
  const linked = await tx
    .selectDistinct({ productId: productStyles.productId })
    .from(productStyles)
    .orderBy(asc(productStyles.productId));
  if (!linked.length) return;
  const productIds = linked.map((row) => row.productId);
  await tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for('update');
  const styles = await tx
    .select()
    .from(productStyles)
    .innerJoin(products, eq(products.id, productStyles.productId))
    .where(
      and(
        inArray(productStyles.productId, productIds),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(asc(productStyles.productId), asc(productStyles.sortOrder));
  const materialRows = await tx
    .select({
      id: materials.id,
      code: materials.code,
      name: materials.name,
      materialType: materials.materialType,
      brand: materials.brand,
      colorName: materials.colorName,
      colorHex: materials.colorHex,
      isActive: materials.isActive,
    })
    .from(materials)
    .orderBy(asc(materials.id));
  for (const row of styles)
    await syncStyleSingles(tx, row.product_styles, materialRows);
  for (const id of productIds) await refreshProductPrice(tx, id);
}

export async function replaceProductStyles(
  productId: string,
  input: ReplaceProductStylesInput,
  context: { admin: AdminIdentity; ip: string },
) {
  await withAdminLog(
    async (tx) => {
      await lockStyleCatalog(tx, productId);
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .for('update');
      if (!product) throw new BizError('NOT_FOUND', '商品不存在');
      const existingStyles = await tx
        .select()
        .from(productStyles)
        .where(eq(productStyles.productId, productId));
      const existingVariants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));
      const existingById = new Map(existingVariants.map((v) => [v.id, v]));
      for (const style of input.styles) {
        if (style.id && !existingStyles.some((item) => item.id === style.id))
          throw new BizError('PARAM_INVALID', '款式不属于当前商品');
        for (const color of style.colorways) {
          if (
            color.id &&
            (!existingById.has(color.id) ||
              existingById.get(color.id)?.sourceMaterialId)
          )
            throw new BizError(
              'PARAM_INVALID',
              '配色 SKU 不属于当前商品或属于自动单色',
            );
        }
      }
      const materialRows = await tx
        .select({
          id: materials.id,
          code: materials.code,
          name: materials.name,
          materialType: materials.materialType,
          brand: materials.brand,
          colorName: materials.colorName,
          colorHex: materials.colorHex,
          isActive: materials.isActive,
        })
        .from(materials)
        .orderBy(asc(materials.id));
      const materialIds = new Set(materialRows.map((m) => m.id));
      for (const style of input.styles) {
        const referenced = [
          ...style.materialIds,
          ...style.colorways.flatMap((c) => c.bom.map((b) => b.materialId)),
          ...style.singleImages.map((i) => i.materialId),
        ];
        if (referenced.some((id) => !materialIds.has(id)))
          throw new BizError('PARAM_INVALID', '配色包含不存在的耗材');
        if (
          style.materialIds.some(
            (id) => !materialRows.find((m) => m.id === id)?.colorName?.trim(),
          )
        )
          throw new BizError('PARAM_INVALID', '单色耗材需要填写颜色名称');
      }
      // Temporarily free names for a legitimate rename/swap without replacing IDs.
      for (const style of existingStyles)
        await tx
          .update(productStyles)
          .set({ name: `__edit__${style.id}` })
          .where(eq(productStyles.id, style.id));
      const retainedStyleIds = new Set<string>();
      const retainedManualIds = new Set<string>();
      for (const [index, draft] of input.styles.entries()) {
        const id = draft.id ?? crypto.randomUUID();
        retainedStyleIds.add(id);
        const values = {
          productId,
          name: draft.name,
          price: draft.price,
          weightGrams: draft.weightGrams,
          materialGrams: draft.materialGrams,
          printHours: draft.printHours,
          imageUrl: draft.imageUrl,
          singleMaterialMode: draft.singleMaterialMode,
          materialIds: [...new Set(draft.materialIds)],
          isActive: draft.isActive,
          sortOrder: index,
          updatedAt: new Date(),
        };
        if (draft.id)
          await tx
            .update(productStyles)
            .set(values)
            .where(eq(productStyles.id, id));
        else await tx.insert(productStyles).values({ ...values, id });
        await syncStyleSingles(
          tx,
          { ...values, id, createdAt: new Date() },
          materialRows,
          draft.colorways.map((color) => color.name),
        );
        for (const image of draft.singleImages) {
          await tx
            .update(productVariants)
            .set({ imageUrl: image.imageUrl })
            .where(
              and(
                eq(productVariants.styleId, id),
                eq(productVariants.sourceMaterialId, image.materialId),
              ),
            );
        }
        for (const [colorIndex, color] of draft.colorways.entries()) {
          const variantId = color.id ?? crypto.randomUUID();
          retainedManualIds.add(variantId);
          const normalizedBom = mergeColorwayBom(color.bom);
          const data = {
            productId,
            styleId: id,
            sourceMaterialId: null,
            name: `${draft.name} / ${color.name}`.slice(0, 150),
            attributes: { style: draft.name, color: color.name },
            price: draft.price,
            weightGrams: draft.weightGrams,
            printHours: draft.printHours,
            imageUrl: color.imageUrl,
            isActive: draft.isActive,
            sortOrder: index * 3000 + 2000 + colorIndex,
            updatedAt: new Date(),
          };
          if (color.id)
            await tx
              .update(productVariants)
              .set(data)
              .where(eq(productVariants.id, variantId));
          else
            await tx
              .insert(productVariants)
              .values({ ...data, id: variantId, skuCode: `SC-${variantId}` });
          await tx
            .delete(variantMaterials)
            .where(eq(variantMaterials.variantId, variantId));
          await tx.insert(variantMaterials).values(
            normalizedBom.map((item, sortOrder) => ({
              ...item,
              variantId,
              sortOrder,
            })),
          );
        }
      }
      for (const variant of existingVariants) {
        if (
          (!variant.sourceMaterialId && !retainedManualIds.has(variant.id)) ||
          (variant.styleId && !retainedStyleIds.has(variant.styleId))
        )
          await tx
            .update(productVariants)
            .set({
              isActive: false,
              ...(!variant.sourceMaterialId ? { styleId: null } : {}),
            })
            .where(eq(productVariants.id, variant.id));
      }
      for (const style of existingStyles) {
        if (!retainedStyleIds.has(style.id))
          await tx.delete(productStyles).where(eq(productStyles.id, style.id));
      }
      await refreshProductPrice(tx, productId);
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'product.styles.replace',
      targetType: 'product',
      targetId: productId,
      ip: context.ip,
      payload: { styleCount: input.styles.length },
    },
  );
  return getProductDetail(productId);
}
