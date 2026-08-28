import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  categories,
  materialStockMovements,
  materials,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { stockInMaterial } from '@/lib/services/material.service';
import {
  createProduct,
  deleteProduct,
  getProductDetail,
  listProducts,
  replaceProductVariants,
  updateProduct,
  updateProductStatus,
} from '@/lib/services/product.service';

async function main(): Promise<void> {
  const db = getDb();
  let categoryId: string | undefined;
  let productId: string | undefined;
  let duplicateProductId: string | undefined;
  const materialIds: string[] = [];

  try {
    const [adminRecord] = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        name: adminUsers.name,
        roleCode: adminRoles.code,
        permissions: adminRoles.permissions,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(
        and(
          eq(adminRoles.code, 'super_admin'),
          eq(adminUsers.status, 'active'),
        ),
      )
      .limit(1);
    assert(adminRecord, 'an active super-admin account is required');
    const admin: AdminIdentity = {
      sub: adminRecord.id,
      username: adminRecord.username,
      name: adminRecord.name,
      roleCode: adminRecord.roleCode,
      permissions: adminRecord.permissions,
    };
    const context = { admin, ip: '127.0.0.1' };
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);

    const [category] = await db
      .insert(categories)
      .values({
        name: 'T033 测试分类',
        slug: `t033-category-${suffix}`,
      })
      .returning({ id: categories.id });
    assert(category);
    categoryId = category.id;

    const insertedMaterials = await db
      .insert(materials)
      .values([
        {
          code: `T033-A-${suffix}`,
          name: 'T033 白色 PLA',
          materialType: 'PLA',
          stockGrams: '1000.00',
          safetyGrams: '0.00',
          wasteRate: '0.1000',
          unitCostPerKg: '60.00',
        },
        {
          code: `T033-B-${suffix}`,
          name: 'T033 黑色 PLA',
          materialType: 'PLA',
          stockGrams: '15.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
          unitCostPerKg: '65.00',
        },
      ])
      .returning({ id: materials.id });
    assert.equal(insertedMaterials.length, 2);
    materialIds.push(...insertedMaterials.map((material) => material.id));
    const materialAId = insertedMaterials[0]!.id;
    const materialBId = insertedMaterials[1]!.id;

    const product = await createProduct(
      {
        categoryId,
        name: 'T033 多耗材测试商品',
        slug: `t033-product-${suffix}`,
        subtitle: '双耗材可售联动测试',
        description: '# T033',
        mainImageUrl: null,
        gallery: [],
        modelPreviewUrl: null,
        specs: { 尺寸: '10cm' },
        isFeatured: false,
        sortOrder: 0,
      },
      context,
    );
    productId = product.id;
    const createdProductId = product.id;

    await assert.rejects(
      () =>
        createProduct(
          {
            categoryId,
            name: '重复 Slug 商品',
            slug: product.slug,
            subtitle: null,
            description: null,
            mainImageUrl: null,
            gallery: [],
            modelPreviewUrl: null,
            specs: {},
            isFeatured: false,
            sortOrder: 0,
          },
          context,
        ),
      (error: unknown) =>
        error instanceof BizError && error.message === '商品 Slug 已存在',
    );

    await assert.rejects(
      () =>
        replaceProductVariants(
          createdProductId,
          {
            variants: [
              {
                id: null,
                skuCode: `T033-NOBOM-${suffix}`,
                name: '无 BOM 变体',
                attributes: {},
                price: '59.00',
                comparePrice: null,
                weightGrams: '120.00',
                printHours: '3.50',
                imageUrl: null,
                isActive: true,
                sortOrder: 0,
                bom: [],
              },
            ],
          },
          context,
        ),
      (error: unknown) => error instanceof BizError && error.code === 40911,
    );

    const saved = await replaceProductVariants(
      createdProductId,
      {
        variants: [
          {
            id: null,
            skuCode: `T033-DUAL-${suffix}`,
            name: '白色 / 黑色',
            attributes: { color: '白色+黑色' },
            price: '59.00',
            comparePrice: '79.00',
            weightGrams: '120.00',
            printHours: '3.50',
            imageUrl: null,
            isActive: true,
            sortOrder: 0,
            bom: [
              { materialId: materialAId, grams: '100.00' },
              { materialId: materialBId, grams: '20.00' },
            ],
          },
          {
            id: null,
            skuCode: `T033-DISABLED-${suffix}`,
            name: '停用备用变体',
            attributes: { status: 'disabled' },
            price: '9.00',
            comparePrice: null,
            weightGrams: '0.00',
            printHours: null,
            imageUrl: null,
            isActive: false,
            sortOrder: 1,
            bom: [],
          },
        ],
      },
      context,
    );
    assert.equal(saved.variants.length, 2);
    const activeVariant = saved.variants.find((variant) => variant.isActive);
    assert(activeVariant);
    assert.equal(activeVariant.bom.length, 2);
    assert.equal(activeVariant.availableQty, 0);
    assert.equal(saved.minPrice, '59.00');

    const duplicateProduct = await createProduct(
      {
        categoryId,
        name: 'T033 SKU 唯一性测试商品',
        slug: `t033-sku-unique-${suffix}`,
        subtitle: null,
        description: null,
        mainImageUrl: null,
        gallery: [],
        modelPreviewUrl: null,
        specs: {},
        isFeatured: false,
        sortOrder: 0,
      },
      context,
    );
    duplicateProductId = duplicateProduct.id;
    await assert.rejects(
      () =>
        replaceProductVariants(
          duplicateProduct.id,
          {
            variants: [
              {
                id: null,
                skuCode: activeVariant.skuCode,
                name: '重复 SKU',
                attributes: {},
                price: '10.00',
                comparePrice: null,
                weightGrams: '10.00',
                printHours: null,
                imageUrl: null,
                isActive: true,
                sortOrder: 0,
                bom: [{ materialId: materialAId, grams: '10.00' }],
              },
            ],
          },
          context,
        ),
      (error: unknown) =>
        error instanceof BizError && error.message === 'SKU 编码已存在',
    );

    await stockInMaterial(
      materialBId,
      {
        grams: '85.00',
        unitCostPerKg: '65.00',
        batchNo: `T033-${suffix}`,
        remark: 'T033 availability test',
      },
      context,
    );
    const replenished = await getProductDetail(createdProductId);
    assert.equal(
      replenished.variants.find((variant) => variant.id === activeVariant.id)
        ?.availableQty,
      5,
    );

    const fourVariants = await replaceProductVariants(
      createdProductId,
      {
        variants: [
          {
            id: activeVariant.id,
            skuCode: activeVariant.skuCode,
            name: '小号 / 白色',
            attributes: { size: '小号', color: '白色' },
            price: '49.00',
            comparePrice: '79.00',
            weightGrams: '120.00',
            printHours: '3.50',
            imageUrl: null,
            isActive: true,
            sortOrder: 0,
            bom: [
              { materialId: materialAId, grams: '100.00' },
              { materialId: materialBId, grams: '20.00' },
            ],
          },
          ...[
            ['小号', '黑色', '59.00'],
            ['大号', '白色', '69.00'],
            ['大号', '黑色', '79.00'],
          ].map(([size, color, price], index) => ({
            id: null,
            skuCode: `T033-4X2-${index + 1}-${suffix}`,
            name: `${size} / ${color}`,
            attributes: { size: size!, color: color! },
            price: price!,
            comparePrice: null,
            weightGrams: '120.00',
            printHours: '3.50',
            imageUrl: null,
            isActive: true,
            sortOrder: index + 1,
            bom: [
              { materialId: materialAId, grams: '100.00' },
              { materialId: materialBId, grams: '20.00' },
            ],
          })),
        ],
      },
      context,
    );
    assert.equal(fourVariants.variants.length, 4);
    assert(
      fourVariants.variants.every(
        (variant) => variant.bom.length === 2 && variant.availableQty === 5,
      ),
    );
    assert.equal(fourVariants.minPrice, '49.00');

    const replaced = await replaceProductVariants(
      createdProductId,
      {
        variants: [
          {
            id: activeVariant.id,
            skuCode: activeVariant.skuCode,
            name: '白色 / 黑色（已编辑）',
            attributes: activeVariant.attributes,
            price: '49.00',
            comparePrice: '79.00',
            weightGrams: activeVariant.weightGrams,
            printHours: activeVariant.printHours,
            imageUrl: activeVariant.imageUrl,
            isActive: true,
            sortOrder: 0,
            bom: activeVariant.bom.map((item) => ({
              materialId: item.materialId,
              grams: item.grams,
            })),
          },
        ],
      },
      context,
    );
    assert.equal(replaced.variants.length, 1);
    assert.equal(replaced.minPrice, '49.00');
    assert.equal(replaced.variants[0]?.availableQty, 5);

    const updated = await updateProduct(
      createdProductId,
      { subtitle: '商品信息已编辑', isFeatured: true },
      context,
    );
    assert.equal(updated.isFeatured, true);
    const status = await updateProductStatus(
      createdProductId,
      'on_sale',
      context,
    );
    assert.equal(status.status, 'on_sale');

    const listed = await listProducts({
      keyword: `t033-product-${suffix}`,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 1);
    assert.equal(listed.list[0]?.variantCount, 1);
    assert.equal(listed.list[0]?.minPrice, '49.00');

    await replaceProductVariants(createdProductId, { variants: [] }, context);
    await assert.rejects(
      () => updateProductStatus(createdProductId, 'on_sale', context),
      (error: unknown) => error instanceof BizError && error.code === 40911,
    );

    const deletion = await deleteProduct(createdProductId, context);
    assert.equal(deletion.deleted, true);
    await assert.rejects(
      () => getProductDetail(createdProductId),
      (error: unknown) => error instanceof BizError && error.code === 40401,
    );

    const auditLogs = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.targetId, createdProductId));
    for (const action of [
      'product.create',
      'product.update',
      'product.status.update',
      'product.variants.replace',
      'product.delete',
    ]) {
      assert(auditLogs.some((log) => log.action === action));
    }
  } finally {
    if (duplicateProductId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.targetId, duplicateProductId));
      await db.delete(products).where(eq(products.id, duplicateProductId));
    }
    if (productId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.targetId, productId));
      await db
        .delete(variantMaterials)
        .where(
          inArray(
            variantMaterials.variantId,
            db
              .select({ id: productVariants.id })
              .from(productVariants)
              .where(eq(productVariants.productId, productId)),
          ),
        );
      await db
        .delete(productVariants)
        .where(eq(productVariants.productId, productId));
      await db.delete(products).where(eq(products.id, productId));
    }
    if (materialIds.length > 0) {
      await db
        .delete(adminOperationLogs)
        .where(inArray(adminOperationLogs.targetId, materialIds));
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.materialId, materialIds));
      await db.delete(materials).where(inArray(materials.id, materialIds));
    }
    if (categoryId) {
      await db.delete(categories).where(eq(categories.id, categoryId));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Product integration tests passed; CRUD, full variant/BOM replacement, availability, min price, publishing guards, and audit logs verified.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Product integration tests failed: ${message}\n`);
  process.exitCode = 1;
});
