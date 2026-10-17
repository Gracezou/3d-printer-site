import assert from 'node:assert/strict';
import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import {
  deviceBrands,
  deviceModels,
  products,
  productVariants,
  productStyles,
  productDeviceModels,
  materials,
  variantMaterials,
  adminRoles,
  adminUsers,
} from '@/lib/db/schema';
import { listStorefrontProducts } from '@/lib/services/storefront.service';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';
import { assertLocalDatabaseUrl } from '../../scripts/assert-local-database';
import { fixtureIds as ids } from './fixtures';
import teardown from './teardown';

export default async function setup() {
  assertLocalDatabaseUrl();
  await teardown();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(adminRoles)
        .values({
          id: ids.adminRole,
          code: 'e2e-v031-editor',
          name: '本地浏览器测试',
          permissions: ['product:edit', 'product:view', 'category:view'],
        })
        .onConflictDoNothing();
      await tx
        .insert(adminUsers)
        .values({
          id: ids.admin,
          username: 'e2e-v031-editor',
          name: '本地浏览器测试',
          passwordHash: 'no-password-login-for-e2e-fixture',
          roleId: ids.adminRole,
        })
        .onConflictDoNothing();
      await tx
        .insert(deviceBrands)
        .values({ id: ids.brand, name: '浏览器测试', slug: 'e2e-v031' })
        .onConflictDoNothing();
      await tx
        .insert(deviceModels)
        .values({
          id: ids.model,
          brandId: ids.brand,
          name: 'X3',
          slug: 'x3',
          isMolded: true,
        })
        .onConflictDoNothing();
      await tx
        .insert(products)
        .values({
          id: ids.product,
          name: 'X3 测试保护壳',
          slug: 'e2e-v031-case',
          status: 'on_sale',
          isFeatured: true,
          minPrice: '20.00',
        })
        .onConflictDoNothing();
      await tx
        .insert(productDeviceModels)
        .values({ productId: ids.product, deviceModelId: ids.model })
        .onConflictDoNothing();
      await tx
        .insert(materials)
        .values({
          id: ids.material,
          code: 'E2E-V031',
          name: '本地浏览器测试耗材',
          materialType: 'PLA',
          colorName: '黑色',
          colorHex: '#000000',
          stockGrams: '10000.00',
        })
        .onConflictDoNothing();
      for (const variant of [
        {
          id: ids.small,
          name: '小号黑色',
          attributes: { size: '小号', color: '黑色' },
          price: '20.00',
        },
        {
          id: ids.large,
          name: '大号拼色',
          attributes: { size: '大号', color: '拼色' },
          price: '30.00',
        },
      ]) {
        await tx
          .insert(productVariants)
          .values({ ...variant, productId: ids.product, skuCode: variant.id })
          .onConflictDoNothing();
        await tx
          .insert(variantMaterials)
          .values({
            variantId: variant.id,
            materialId: ids.material,
            grams: '10.00',
          })
          .onConflictDoNothing();
      }
      await tx
        .insert(materials)
        .values({
          id: ids.whiteMaterial,
          code: 'E2E-WHITE',
          name: '浏览器测试白色',
          materialType: 'PLA',
          colorName: '白色',
          colorHex: '#FFFFFF',
          stockGrams: '20.00',
          wasteRate: '0.0000',
        })
        .onConflictDoNothing();
      const image = (name: string) =>
        `https://browser-test.invalid/storage/v1/object/public/e2e/${name}.png`;
      await tx
        .insert(products)
        .values([
          {
            id: ids.colorProduct,
            name: '配色联动测试保护壳',
            slug: 'e2e-colorways',
            status: 'on_sale',
            mainImageUrl: image('main'),
            gallery: [image('gallery')],
            minPrice: '20.00',
          },
          {
            id: ids.adminStyleProduct,
            name: '后台款式编辑测试',
            slug: 'e2e-admin-styles',
            status: 'draft',
          },
        ])
        .onConflictDoNothing();
      await tx
        .insert(productStyles)
        .values([
          {
            id: ids.standardStyle,
            productId: ids.colorProduct,
            name: '标准款',
            price: '20.00',
            weightGrams: '30.00',
            materialGrams: '30.00',
            imageUrl: image('standard'),
            singleMaterialMode: 'all',
          },
          {
            id: ids.standStyle,
            productId: ids.colorProduct,
            name: '支架款',
            price: '30.00',
            weightGrams: '40.00',
            materialGrams: '40.00',
            imageUrl: image('stand'),
            singleMaterialMode: 'selected',
            materialIds: [ids.material],
            sortOrder: 1,
          },
        ])
        .onConflictDoNothing();
      for (const variant of [
        {
          id: ids.black,
          styleId: ids.standardStyle,
          sourceMaterialId: ids.material,
          name: '标准款 / 黑色',
          attributes: { style: '标准款', color: '黑色' },
          price: '20.00',
          imageUrl: image('black'),
          weightGrams: '30.00',
        },
        {
          id: ids.dual,
          styleId: ids.standardStyle,
          name: '标准款 / 黑白拼色',
          attributes: { style: '标准款', color: '黑白拼色' },
          price: '20.00',
          imageUrl: image('dual'),
          weightGrams: '30.00',
        },
        {
          id: ids.standBlack,
          styleId: ids.standStyle,
          sourceMaterialId: ids.material,
          name: '支架款 / 黑色',
          attributes: { style: '支架款', color: '黑色' },
          price: '30.00',
          weightGrams: '40.00',
        },
      ]) {
        await tx
          .insert(productVariants)
          .values({
            ...variant,
            productId: ids.colorProduct,
            skuCode: variant.id,
          })
          .onConflictDoNothing();
        await tx
          .insert(variantMaterials)
          .values({
            variantId: variant.id,
            materialId: ids.material,
            grams: variant.id === ids.dual ? '20.00' : variant.weightGrams,
          })
          .onConflictDoNothing();
        if (variant.id === ids.dual)
          await tx
            .insert(variantMaterials)
            .values({
              variantId: variant.id,
              materialId: ids.whiteMaterial,
              grams: '10.00',
              sortOrder: 1,
            })
            .onConflictDoNothing();
      }
    });
    const result = await listStorefrontProducts(
      storefrontProductListQuerySchema.parse({ deviceModelId: ids.model }),
    );
    assert(
      result.list.some(
        (product) =>
          product.id === ids.product &&
          product.deviceModels?.[0]?.id === ids.model,
      ),
    );
    const none = await listStorefrontProducts(
      storefrontProductListQuerySchema.parse({
        deviceModelId: 'f0310000-0000-4000-8000-000000000099',
      }),
    );
    assert.equal(none.total, 0);
  } finally {
    await closeDatabaseConnection();
  }
}
