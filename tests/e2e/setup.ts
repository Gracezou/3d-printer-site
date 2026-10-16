import assert from 'node:assert/strict';
import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import {
  deviceBrands,
  deviceModels,
  products,
  productVariants,
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

export default async function setup() {
  assertLocalDatabaseUrl();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(adminRoles)
        .values({
          id: ids.adminRole,
          code: 'e2e-v031-editor',
          name: '本地浏览器测试',
          permissions: ['product:edit', 'product:view'],
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
