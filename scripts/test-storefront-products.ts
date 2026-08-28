import assert from 'node:assert/strict';

import { inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  categories,
  materials,
  products,
  productVariants,
  variantMaterials,
} from '@/lib/db/schema';
import { listStorefrontProducts } from '@/lib/services/storefront.service';
import type { StorefrontProductListQuery } from '@/lib/validators/storefront';

const defaults: StorefrontProductListQuery = {
  sort: 'default',
  page: 1,
  pageSize: 24,
};

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  let materialId: string | undefined;

  try {
    const [parentCategory] = await db
      .insert(categories)
      .values({ name: 'T042 主分类', slug: `t042-parent-${suffix}` })
      .returning({ id: categories.id });
    assert(parentCategory);
    categoryIds.push(parentCategory.id);

    const [childCategory, otherCategory] = await db
      .insert(categories)
      .values([
        {
          parentId: parentCategory.id,
          name: 'T042 子分类',
          slug: `t042-child-${suffix}`,
        },
        { name: 'T042 其他分类', slug: `t042-other-${suffix}` },
      ])
      .returning({ id: categories.id });
    assert(childCategory && otherCategory);
    categoryIds.push(childCategory.id, otherCategory.id);

    const [material] = await db
      .insert(materials)
      .values({
        code: `T042-MATERIAL-${suffix}`,
        name: 'T042 充足耗材',
        materialType: 'PLA',
        stockGrams: '10000.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;

    const insertedProducts = await db
      .insert(products)
      .values([
        {
          categoryId: childCategory.id,
          name: 'T042 经济款 PLA',
          slug: `t042-cheap-${suffix}`,
          status: 'on_sale',
          minPrice: '20.00',
          sortOrder: 3,
        },
        {
          categoryId: childCategory.id,
          name: 'T042 售罄款 PETG',
          slug: `t042-sold-out-${suffix}`,
          status: 'on_sale',
          minPrice: '30.00',
          sortOrder: 2,
        },
        {
          categoryId: otherCategory.id,
          name: 'T042 高端款 PLA',
          slug: `t042-premium-${suffix}`,
          status: 'on_sale',
          minPrice: '50.00',
          sortOrder: 1,
        },
        {
          categoryId: otherCategory.id,
          name: 'T042 草稿商品',
          slug: `t042-draft-${suffix}`,
          status: 'draft',
          minPrice: '10.00',
        },
      ])
      .returning({ id: products.id, name: products.name });
    assert.equal(insertedProducts.length, 4);
    productIds.push(...insertedProducts.map((product) => product.id));
    const byName = new Map(
      insertedProducts.map((product) => [product.name, product.id]),
    );
    const cheapProductId = byName.get('T042 经济款 PLA');
    const soldOutProductId = byName.get('T042 售罄款 PETG');
    const premiumProductId = byName.get('T042 高端款 PLA');
    assert(cheapProductId && soldOutProductId && premiumProductId);

    const insertedVariants = await db
      .insert(productVariants)
      .values([
        {
          productId: cheapProductId,
          skuCode: `T042-CHEAP-${suffix}`,
          name: 'PLA 经济款',
          attributes: { material: 'PLA' },
          price: '20.00',
        },
        {
          productId: soldOutProductId,
          skuCode: `T042-SOLD-${suffix}`,
          name: 'PETG 售罄款',
          attributes: { material: 'PETG' },
          price: '30.00',
        },
        {
          productId: premiumProductId,
          skuCode: `T042-PREMIUM-${suffix}`,
          name: 'PLA 高端款',
          attributes: { material: 'PLA' },
          price: '50.00',
        },
      ])
      .returning({
        id: productVariants.id,
        productId: productVariants.productId,
      });
    const variantsByProductId = new Map(
      insertedVariants.map((variant) => [variant.productId, variant]),
    );
    const cheapVariant = variantsByProductId.get(cheapProductId);
    const soldOutVariant = variantsByProductId.get(soldOutProductId);
    const premiumVariant = variantsByProductId.get(premiumProductId);
    assert(cheapVariant && soldOutVariant && premiumVariant);
    await db.insert(variantMaterials).values([
      {
        variantId: cheapVariant.id,
        materialId,
        grams: '10.00',
      },
      {
        variantId: premiumVariant.id,
        materialId,
        grams: '20.00',
      },
    ]);

    const parentResult = await listStorefrontProducts({
      ...defaults,
      categoryId: parentCategory.id,
    });
    assert.equal(parentResult.total, 2, '一级分类应包含二级分类商品');
    assert.equal(
      parentResult.list.find((product) => product.id === soldOutProductId)
        ?.isSoldOut,
      true,
      '无 BOM 变体对应商品应显示售罄',
    );

    const combinedResult = await listStorefrontProducts({
      ...defaults,
      categoryId: parentCategory.id,
      minPrice: '15.00',
      maxPrice: '25.00',
      materialType: 'PLA',
    });
    assert.deepEqual(
      combinedResult.list.map((product) => product.name),
      ['T042 经济款 PLA'],
      '分类、价格和材质组合筛选应同时生效',
    );
    assert.equal(combinedResult.list[0]?.isSoldOut, false);

    const sortedResult = await listStorefrontProducts({
      ...defaults,
      sort: 'price_desc',
      pageSize: 2,
    });
    assert.equal(sortedResult.total, 3, '草稿商品不得出现在前台');
    assert.equal(sortedResult.pageCount, 2);
    assert.deepEqual(
      sortedResult.list.map((product) => product.minPrice),
      ['50.00', '30.00'],
    );

    const secondPage = await listStorefrontProducts({
      ...defaults,
      sort: 'price_desc',
      page: 2,
      pageSize: 2,
    });
    assert.deepEqual(
      secondPage.list.map((product) => product.minPrice),
      ['20.00'],
    );

    console.info(
      'T042 商品列表测试通过：组合筛选、父子分类、价格排序、分页与售罄角标均正确。',
    );
  } finally {
    if (productIds.length > 0) {
      await db.delete(products).where(inArray(products.id, productIds));
    }
    if (materialId) {
      await db.delete(materials).where(inArray(materials.id, [materialId]));
    }
    if (categoryIds.length > 0) {
      await db.delete(categories).where(inArray(categories.id, categoryIds));
    }
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
