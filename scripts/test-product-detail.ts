import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { getByProductId } from '@/lib/services/availability.service';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  materials,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { getStorefrontProductBySlug } from '@/lib/services/storefront.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const slug = `t043-detail-${suffix}`;
  let productId: string | undefined;
  let materialId: string | undefined;

  try {
    const [material] = await db
      .insert(materials)
      .values({
        code: `T043-MATERIAL-${suffix}`,
        name: 'T043 实时库存耗材',
        materialType: 'PLA',
        stockGrams: '30.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;

    const [product] = await db
      .insert(products)
      .values({
        name: 'T043 商品详情测试',
        slug,
        subtitle: '详情与实时可售联动测试',
        description: '# 安全 Markdown',
        specs: { 材质: 'PLA', 尺寸: '10cm' },
        status: 'on_sale',
        minPrice: '39.00',
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;

    const insertedVariants = await db
      .insert(productVariants)
      .values([
        {
          productId,
          skuCode: `T043-ACTIVE-${suffix}`,
          name: '小号 / PLA',
          attributes: { size: '小号', material: 'PLA' },
          price: '39.00',
        },
        {
          productId,
          skuCode: `T043-INACTIVE-${suffix}`,
          name: '停用变体',
          attributes: { size: '大号', material: 'PLA' },
          price: '59.00',
          isActive: false,
        },
      ])
      .returning({
        id: productVariants.id,
        isActive: productVariants.isActive,
      });
    const sellableVariant = insertedVariants.find(
      (variant) => variant.isActive,
    );
    const inactiveVariant = insertedVariants.find(
      (variant) => !variant.isActive,
    );
    assert(sellableVariant && inactiveVariant);

    await db.insert(variantMaterials).values({
      variantId: sellableVariant.id,
      materialId,
      grams: '10.00',
    });

    const detail = await getStorefrontProductBySlug(slug);
    assert.equal(detail.variants.length, 1, '详情接口不得返回停用变体');
    assert.equal(detail.variants[0]?.id, sellableVariant.id);
    assert.equal(
      'availableQty' in detail.variants[0]!,
      false,
      '静态详情不得混入可售状态',
    );
    assert.equal(
      'bom' in detail.variants[0]!,
      false,
      '前台详情不得返回 BOM 克数',
    );

    const before = await getByProductId(productId);
    const beforeById = new Map(
      before.map((item) => [item.variantId, item.availableQty]),
    );
    assert.equal(beforeById.get(sellableVariant.id), 3);
    assert.equal(beforeById.get(inactiveVariant.id), 0);

    await db
      .update(materials)
      .set({ stockGrams: '0.00' })
      .where(eq(materials.id, materialId));
    const after = await getByProductId(productId);
    assert.equal(
      after.find((item) => item.variantId === sellableVariant.id)?.availableQty,
      0,
    );

    console.info(
      'T043 商品详情测试通过：静态详情不含库存/BOM，停用变体隐藏，库存归零后实时可售数量变为 0。',
    );
  } finally {
    if (productId) {
      await db.delete(products).where(inArray(products.id, [productId]));
    }
    if (materialId) {
      await db.delete(materials).where(inArray(materials.id, [materialId]));
    }
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
