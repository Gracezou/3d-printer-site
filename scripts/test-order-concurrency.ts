import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  materialStockMovements,
  materials,
  orders,
  productVariants,
  products,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { getByVariantIds } from '@/lib/services/availability.service';
import { createOrder } from '@/lib/services/order.service';

async function main() {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds = Array.from({ length: 10 }, () => crypto.randomUUID());
  let productId = '';
  let materialId = '';

  try {
    await db.insert(userProfiles).values(
      userIds.map((id, index) => ({
        id,
        phone: `19888${suffix.slice(0, 4)}${String(index).padStart(2, '0')}`,
        nickname: `并发用户 ${index + 1}`,
      })),
    );
    const addressRows = await db
      .insert(addresses)
      .values(
        userIds.map((userId, index) => ({
          userId,
          receiverName: `并发用户 ${index + 1}`,
          receiverPhone: `198000000${String(index).padStart(2, '0')}`,
          province: '广东省',
          provinceCode: '440000',
          city: '深圳市',
          district: '南山区',
          detail: `并发测试路 ${index + 1} 号`,
        })),
      )
      .returning({ id: addresses.id, userId: addresses.userId });
    const addressByUser = new Map(
      addressRows.map((address) => [address.userId, address.id]),
    );
    const [material] = await db
      .insert(materials)
      .values({
        code: `T101-RACE-${suffix}`,
        name: 'T101 五件库存并发耗材',
        materialType: 'PLA',
        stockGrams: '50.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    materialId = material!.id;
    const [product] = await db
      .insert(products)
      .values({
        name: 'T101 并发验收商品',
        slug: `t101-concurrency-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    productId = product!.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `T101-RACE-${suffix}`,
        name: '限量五件款',
        price: '10.00',
        weightGrams: '10.00',
      })
      .returning({ id: productVariants.id });
    await db.insert(variantMaterials).values({
      variantId: variant!.id,
      materialId,
      grams: '10.00',
    });
    assert.equal((await getByVariantIds([variant!.id]))[0]?.availableQty, 5);

    const results = await Promise.allSettled(
      userIds.map((userId) =>
        createOrder(userId, {
          items: [{ variantId: variant!.id, quantity: 1 }],
          addressId: addressByUser.get(userId)!,
          fromCart: false,
        }),
      ),
    );
    const successes = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createOrder>>
      > => result.status === 'fulfilled',
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    assert.equal(successes.length, 5, '10 个并发请求必须恰好成功 5 个');
    assert.equal(failures.length, 5, '库存耗尽后必须恰好失败 5 个');
    for (const failure of failures) {
      assert.ok(failure.reason instanceof BizError);
      assert.equal(failure.reason.code, 40901);
    }
    const [stock] = await db
      .select({ reservedGrams: materials.reservedGrams })
      .from(materials)
      .where(eq(materials.id, materialId));
    assert.equal(stock!.reservedGrams, '50.00');
    assert.equal((await getByVariantIds([variant!.id]))[0]?.availableQty, 0);
    process.stdout.write(
      'Order concurrency acceptance passed: 10 simultaneous orders for quantity 5 produced exactly 5 successes, 5 inventory errors, and no oversell.\n',
    );
  } finally {
    const createdOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.userId, userIds));
    if (createdOrders.length)
      await db.delete(orders).where(
        inArray(
          orders.id,
          createdOrders.map((order) => order.id),
        ),
      );
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId)
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    await db.delete(userProfiles).where(inArray(userProfiles.id, userIds));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Order concurrency acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
