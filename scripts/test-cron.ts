import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  discountCodes,
  discountRedemptions,
  materialStockMovements,
  materials,
  orders,
  payments,
  productVariants,
  products,
  promotions,
  settings,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import {
  autoCompleteShippedOrders,
  collectLowStockAlert,
  releaseExpiredOrders,
} from '@/lib/services/cron.service';
import { createOrder } from '@/lib/services/order.service';

async function main() {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const settingKeys = ['auto_complete_days', 'low_stock_alert_snapshot'];
  const settingSnapshot = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, settingKeys));
  let productId = '';
  let materialId = '';
  let promotionId = '';
  let codeId = '';

  try {
    await db.insert(userProfiles).values({
      id: userId,
      phone: `130${Date.now().toString().slice(-8)}`,
      nickname: 'T100 定时任务用户',
    });
    const [address] = await db
      .insert(addresses)
      .values({
        userId,
        receiverName: 'T100 用户',
        receiverPhone: '13800138000',
        province: '广东省',
        provinceCode: '440000',
        city: '深圳市',
        district: '南山区',
        detail: '定时任务测试路 100 号',
      })
      .returning({ id: addresses.id });
    const [material] = await db
      .insert(materials)
      .values({
        code: `T100-${suffix}`,
        name: 'T100 定时任务耗材',
        materialType: 'PLA',
        stockGrams: '1000.00',
        safetyGrams: '0.00',
        wasteRate: '0.1000',
      })
      .returning({ id: materials.id });
    materialId = material!.id;
    const [product] = await db
      .insert(products)
      .values({
        name: 'T100 定时任务商品',
        slug: `t100-cron-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    productId = product!.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `T100-${suffix}`,
        name: '标准款',
        price: '100.00',
        weightGrams: '500.00',
      })
      .returning({ id: productVariants.id });
    await db.insert(variantMaterials).values({
      variantId: variant!.id,
      materialId,
      grams: '100.00',
    });
    const [promotion] = await db
      .insert(promotions)
      .values({
        name: 'T100 超时释放优惠',
        discountType: 'fixed_amount',
        discountValue: '10.00',
      })
      .returning({ id: promotions.id });
    promotionId = promotion!.id;
    const [code] = await db
      .insert(discountCodes)
      .values({
        promotionId,
        code: `T100${suffix}`.toUpperCase(),
        codeType: 'limited',
        maxUses: 10,
      })
      .returning({ id: discountCodes.id, code: discountCodes.code });
    codeId = code!.id;

    const created = await createOrder(userId, {
      items: [{ variantId: variant!.id, quantity: 2 }],
      addressId: address!.id,
      discountCode: code!.code,
      fromCart: false,
    });
    const [createdOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNo, created.orderNo));
    const now = new Date();
    await db
      .update(orders)
      .set({ reservedUntil: new Date(now.getTime() - 120_000) })
      .where(eq(orders.id, createdOrder!.id));
    await db.insert(payments).values({
      orderId: createdOrder!.id,
      outTradeNo: `T100-PAY-${suffix}`,
      provider: 'mock',
      amount: created.payableAmount,
      status: 'pending',
    });

    await db.insert(orders).values({
      orderNo: `T100X${suffix}`,
      userId,
      itemsAmount: '1.00',
      payableAmount: '1.00',
      receiverName: 'T100 用户',
      receiverPhone: '13800138000',
      receiverProvince: '广东省',
      receiverCity: '深圳市',
      receiverDistrict: '南山区',
      receiverDetail: '定时任务测试路 100 号',
      reservedUntil: new Date(now.getTime() - 60_000),
    });

    assert.equal(await releaseExpiredOrders(now, 1), 1, '单批限制必须生效');
    assert.equal(await releaseExpiredOrders(now, 1), 1);
    assert.equal(await releaseExpiredOrders(now, 1), 0, '任务必须幂等');

    const [expiredResult] = await db
      .select({
        status: orders.status,
        reason: orders.cancelReason,
        reservedUntil: orders.reservedUntil,
      })
      .from(orders)
      .where(eq(orders.id, createdOrder!.id));
    assert.deepEqual(expiredResult, {
      status: 'cancelled',
      reason: 'payment_timeout',
      reservedUntil: null,
    });
    const [materialAfterRelease] = await db
      .select({ reservedGrams: materials.reservedGrams })
      .from(materials)
      .where(eq(materials.id, materialId));
    assert.equal(materialAfterRelease!.reservedGrams, '0.00');
    const [redemption] = await db
      .select({ status: discountRedemptions.status })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.orderId, createdOrder!.id));
    const [discountCode] = await db
      .select({ usedCount: discountCodes.usedCount })
      .from(discountCodes)
      .where(eq(discountCodes.id, codeId));
    const [closedPayment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.orderId, createdOrder!.id));
    assert.equal(redemption!.status, 'released');
    assert.equal(discountCode!.usedCount, 0);
    assert.equal(closedPayment!.status, 'closed');

    await db
      .insert(settings)
      .values({ key: 'auto_complete_days', value: 15 })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: 15, updatedAt: now },
      });
    const [shipped] = await db
      .insert(orders)
      .values({
        orderNo: `T100S${suffix}`,
        userId,
        status: 'shipped',
        itemsAmount: '20.00',
        payableAmount: '20.00',
        paidAmount: '20.00',
        receiverName: 'T100 用户',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '定时任务测试路 100 号',
        shippedAt: new Date(now.getTime() - 16 * 86_400_000),
      })
      .returning({ id: orders.id });
    assert.equal(await autoCompleteShippedOrders(now), 1);
    assert.equal(await autoCompleteShippedOrders(now), 0, '自动完成必须幂等');
    const [completed] = await db
      .select({ status: orders.status, completedAt: orders.completedAt })
      .from(orders)
      .where(eq(orders.id, shipped!.id));
    assert.equal(completed!.status, 'completed');
    assert.equal(completed!.completedAt?.toISOString(), now.toISOString());

    await db
      .update(materials)
      .set({ safetyGrams: '1200.00' })
      .where(eq(materials.id, materialId));
    const lowStock = await collectLowStockAlert(now);
    assert.ok(lowStock.some((item) => item.id === materialId));
    const [snapshot] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, 'low_stock_alert_snapshot'));
    assert.ok(snapshot?.value && typeof snapshot.value === 'object');

    process.stdout.write(
      'Cron functional test passed: batch limiting, timeout release, stock and discount rollback, payment close, auto-complete, low-stock snapshot, and idempotency.\n',
    );
  } finally {
    const cleanupOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId));
    const cleanupOrderIds = cleanupOrders.map((order) => order.id);
    if (cleanupOrderIds.length) {
      await db
        .delete(payments)
        .where(inArray(payments.orderId, cleanupOrderIds));
      await db.delete(orders).where(inArray(orders.id, cleanupOrderIds));
    }
    if (materialId)
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
    if (codeId)
      await db.delete(discountCodes).where(eq(discountCodes.id, codeId));
    if (promotionId)
      await db.delete(promotions).where(eq(promotions.id, promotionId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await db.delete(settings).where(inArray(settings.key, settingKeys));
    if (settingSnapshot.length)
      await db.insert(settings).values(settingSnapshot);
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Cron test failed: ${message}\n`);
  process.exitCode = 1;
});
