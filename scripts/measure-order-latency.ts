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
import { createOrder } from '@/lib/services/order.service';

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

async function main(): Promise<void> {
  const location = process.env['MEASURE_LOCATION'] ?? 'unknown';
  const sampleCount = Number.parseInt(
    process.env['MEASURE_SAMPLES'] ?? '30',
    10,
  );
  assert.ok(
    Number.isInteger(sampleCount) && sampleCount >= 10 && sampleCount <= 100,
    'MEASURE_SAMPLES must be an integer from 10 to 100',
  );

  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const userId = crypto.randomUUID();
  let productId = '';
  let materialId = '';
  const durations: number[] = [];
  let addressId = '';

  try {
    await db.insert(userProfiles).values({
      id: userId,
      email: `v023-order-${suffix}@example.invalid`,
      nickname: `v0.2.3 ${location} latency probe`,
    });
    const [address] = await db
      .insert(addresses)
      .values({
        userId,
        receiverName: 'v0.2.3 延迟测试',
        receiverPhone: '18800000000',
        province: '上海市',
        provinceCode: '310000',
        city: '上海市',
        district: '浦东新区',
        detail: '隔离测试地址 1 号',
      })
      .returning({ id: addresses.id });
    assert.ok(address);
    addressId = address.id;

    const [material] = await db
      .insert(materials)
      .values({
        code: `V023-LATENCY-${suffix}`,
        name: `v0.2.3 ${location} 下单延迟耗材`,
        materialType: 'PLA',
        stockGrams: String(sampleCount * 20),
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert.ok(material);
    materialId = material.id;

    const [product] = await db
      .insert(products)
      .values({
        name: `v0.2.3 ${location} 下单延迟商品`,
        slug: `v023-order-latency-${location}-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert.ok(product);
    productId = product.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `V023-LATENCY-${location}-${suffix}`.toUpperCase(),
        name: '延迟测试款',
        price: '10.00',
        weightGrams: '10.00',
      })
      .returning({ id: productVariants.id });
    assert.ok(variant);
    await db.insert(variantMaterials).values({
      variantId: variant.id,
      materialId,
      grams: '10.00',
    });

    // Warm the connection and query plan without leaving a business record.
    await db.select({ id: productVariants.id }).from(productVariants).limit(1);

    for (let index = 0; index < sampleCount; index += 1) {
      const startedAt = performance.now();
      await createOrder(userId, {
        items: [{ variantId: variant.id, quantity: 1 }],
        addressId,
        fromCart: false,
        buyerRemark: `v0.2.3 latency sample ${index + 1}`,
      });
      durations.push(performance.now() - startedAt);
    }

    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        measuredAt: new Date().toISOString(),
        location,
        sampleCount,
        successCount: durations.length,
        errorCount: sampleCount - durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        p99Ms: percentile(durations, 0.99),
        minMs: Math.round(Math.min(...durations) * 100) / 100,
        maxMs: Math.round(Math.max(...durations) * 100) / 100,
      })}\n`,
    );
  } finally {
    const createdOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId));
    if (createdOrders.length) {
      await db.delete(orders).where(
        inArray(
          orders.id,
          createdOrders.map((order) => order.id),
        ),
      );
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId) {
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
      await db.delete(materials).where(eq(materials.id, materialId));
    }
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Order latency measurement failed: ${message}\n`);
  process.exitCode = 1;
});
