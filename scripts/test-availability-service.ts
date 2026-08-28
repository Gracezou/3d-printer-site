import assert from 'node:assert/strict';

import { inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  materials,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import {
  getByProductId,
  getByVariantIds,
  type VariantAvailability,
} from '@/lib/services/availability.service';

function assertPublicShape(result: VariantAvailability[]): void {
  for (const item of result) {
    assert.deepEqual(Object.keys(item).sort(), ['availableQty', 'variantId']);
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  let productId: string | undefined;
  const materialIds: string[] = [];

  try {
    const [product] = await db
      .insert(products)
      .values({
        name: 'T040 可售服务测试商品',
        slug: `t040-availability-${suffix}`,
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;

    const insertedMaterials = await db
      .insert(materials)
      .values([
        {
          code: `T040-ACTIVE-${suffix}`,
          name: 'T040 充足耗材',
          materialType: 'PLA',
          stockGrams: '10000.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
        },
        {
          code: `T040-INACTIVE-${suffix}`,
          name: 'T040 停用耗材',
          materialType: 'PLA',
          stockGrams: '10000.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
          isActive: false,
        },
        {
          code: `T040-SHORT-${suffix}`,
          name: 'T040 不足耗材',
          materialType: 'PLA',
          stockGrams: '9.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
        },
      ])
      .returning({ id: materials.id });
    assert.equal(insertedMaterials.length, 3);
    materialIds.push(...insertedMaterials.map((item) => item.id));

    const [activeMaterial, inactiveMaterial, shortMaterial] = insertedMaterials;
    assert(activeMaterial && inactiveMaterial && shortMaterial);

    const insertedVariants = await db
      .insert(productVariants)
      .values([
        {
          productId,
          skuCode: `T040-VARIANT-OFF-${suffix}`,
          name: '停用变体',
          price: '10.00',
          isActive: false,
          sortOrder: 0,
        },
        {
          productId,
          skuCode: `T040-NO-BOM-${suffix}`,
          name: '无 BOM 变体',
          price: '10.00',
          sortOrder: 1,
        },
        {
          productId,
          skuCode: `T040-MATERIAL-OFF-${suffix}`,
          name: '耗材停用变体',
          price: '10.00',
          sortOrder: 2,
        },
        {
          productId,
          skuCode: `T040-MATERIAL-SHORT-${suffix}`,
          name: '耗材不足变体',
          price: '10.00',
          sortOrder: 3,
        },
        {
          productId,
          skuCode: `T040-CAPPED-${suffix}`,
          name: '数量封顶变体',
          price: '10.00',
          sortOrder: 4,
        },
      ])
      .returning({ id: productVariants.id });
    assert.equal(insertedVariants.length, 5);
    const [
      inactiveVariant,
      noBomVariant,
      inactiveMaterialVariant,
      shortVariant,
      cappedVariant,
    ] = insertedVariants;
    assert(
      inactiveVariant &&
        noBomVariant &&
        inactiveMaterialVariant &&
        shortVariant &&
        cappedVariant,
    );

    await db.insert(variantMaterials).values([
      {
        variantId: inactiveVariant.id,
        materialId: activeMaterial.id,
        grams: '1.00',
      },
      {
        variantId: inactiveMaterialVariant.id,
        materialId: inactiveMaterial.id,
        grams: '1.00',
      },
      {
        variantId: shortVariant.id,
        materialId: shortMaterial.id,
        grams: '10.00',
      },
      {
        variantId: cappedVariant.id,
        materialId: activeMaterial.id,
        grams: '1.00',
      },
    ]);

    const requestedIds = [
      cappedVariant.id,
      inactiveVariant.id,
      noBomVariant.id,
      inactiveMaterialVariant.id,
      shortVariant.id,
      cappedVariant.id,
    ];
    const byVariantIds = await getByVariantIds(requestedIds);
    assertPublicShape(byVariantIds);
    assert.deepEqual(byVariantIds, [
      { variantId: cappedVariant.id, availableQty: 99 },
      { variantId: inactiveVariant.id, availableQty: 0 },
      { variantId: noBomVariant.id, availableQty: 0 },
      { variantId: inactiveMaterialVariant.id, availableQty: 0 },
      { variantId: shortVariant.id, availableQty: 0 },
    ]);

    const byProductId = await getByProductId(productId);
    assertPublicShape(byProductId);
    assert.deepEqual(
      byProductId.map((item) => item.availableQty),
      [0, 0, 0, 0, 99],
    );
    assert.deepEqual(await getByVariantIds([]), []);

    console.info(
      'T040 可售服务测试通过：四种不可售场景为 0、对外数量封顶 99、返回值不含耗材字段。',
    );
  } finally {
    if (productId) {
      await db.delete(products).where(inArray(products.id, [productId]));
    }
    if (materialIds.length > 0) {
      await db.delete(materials).where(inArray(materials.id, materialIds));
    }
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
