import assert from 'node:assert/strict';

import { eq, inArray, sql } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  discountCodes,
  discountRedemptions,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  printJobs,
  products,
  productVariants,
  promotions,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { processPaymentNotify } from '@/lib/services/payment-notify.service';
import {
  confirmMockPayment,
  createPayment,
} from '@/lib/services/payment.service';
import { MockPaymentProvider } from '@/lib/services/payment/mock.provider';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const orderIds: string[] = [];
  let productId: string | undefined;
  let materialId: string | undefined;
  let promotionId: string | undefined;
  const oldMockSetting = process.env.ENABLE_MOCK_PAYMENT;
  process.env.ENABLE_MOCK_PAYMENT = 'true';

  try {
    await db.insert(userProfiles).values({
      id: userId,
      phone: `133${suffix.slice(0, 8)}`,
    });
    const [material] = await db
      .insert(materials)
      .values({
        code: `T063-${suffix}`,
        name: 'T063 支付测试耗材',
        materialType: 'PLA',
        stockGrams: '1000.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;

    const [product] = await db
      .insert(products)
      .values({
        name: 'T063 支付测试商品',
        slug: `t063-payment-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        skuCode: `T063-${suffix}`,
        name: '支付测试款',
        price: '100.00',
        weightGrams: '100.00',
      })
      .returning({ id: productVariants.id });
    assert(variant);
    await db.insert(variantMaterials).values({
      variantId: variant.id,
      materialId: material.id,
      grams: '10.00',
    });

    const [promotion] = await db
      .insert(promotions)
      .values({
        name: `T063 支付折扣 ${suffix}`,
        discountType: 'fixed_amount',
        discountValue: '10.00',
      })
      .returning({ id: promotions.id });
    assert(promotion);
    promotionId = promotion.id;
    const discountCodeValue = `T063${suffix}`.toUpperCase();
    const [code] = await db
      .insert(discountCodes)
      .values({
        promotionId: promotion.id,
        code: discountCodeValue,
        codeType: 'permanent',
        maxUses: null,
        usedCount: 1,
      })
      .returning({ id: discountCodes.id });
    assert(code);

    const [order] = await db
      .insert(orders)
      .values({
        orderNo: `T063P${suffix}`,
        userId,
        itemsAmount: '100.00',
        discountAmount: '10.00',
        payableAmount: '90.00',
        discountCodeId: code.id,
        discountCode: discountCodeValue,
        receiverName: '支付测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 1 号',
        reservedUntil: new Date(Date.now() + 30 * 60_000),
      })
      .returning({ id: orders.id, orderNo: orders.orderNo });
    assert(order);
    orderIds.push(order.id);
    const [item] = await db
      .insert(orderItems)
      .values({
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        productName: 'T063 支付测试商品',
        variantName: '支付测试款',
        skuCode: `T063-${suffix}`,
        unitPrice: '100.00',
        quantity: 1,
        subtotal: '100.00',
        bomSnapshot: [
          {
            material_id: material.id,
            material_name: 'T063 支付测试耗材',
            grams: '10.00',
            waste_rate: '0.0000',
            required_grams: '10.00',
          },
        ],
      })
      .returning({ id: orderItems.id });
    assert(item);
    await db.insert(discountRedemptions).values({
      codeId: code.id,
      promotionId: promotion.id,
      userId,
      orderId: order.id,
      discountAmount: '10.00',
    });
    await db.execute(sql`SELECT fn_reserve_order_stock(${order.id}::uuid)`);

    const firstPayment = await createPayment(userId, order.orderNo);
    const secondPayment = await createPayment(userId, order.orderNo);
    assert(firstPayment.payUrl.includes('/checkout/pay/mock'));
    const paymentRows = await db
      .select({ outTradeNo: payments.outTradeNo, status: payments.status })
      .from(payments)
      .where(eq(payments.orderId, order.id));
    assert.equal(
      paymentRows.find((row) => row.outTradeNo === firstPayment.outTradeNo)
        ?.status,
      'closed',
    );

    await Promise.all([
      confirmMockPayment(userId, secondPayment.outTradeNo),
      confirmMockPayment(userId, secondPayment.outTradeNo),
      confirmMockPayment(userId, secondPayment.outTradeNo),
    ]);
    const [paidOrder] = await db
      .select({
        status: orders.status,
        paidAmount: orders.paidAmount,
        reservedUntil: orders.reservedUntil,
      })
      .from(orders)
      .where(eq(orders.id, order.id));
    assert.equal(paidOrder?.status, 'in_production');
    assert.equal(paidOrder?.paidAmount, '90.00');
    assert.equal(paidOrder?.reservedUntil, null);
    const [stock] = await db
      .select({
        stockGrams: materials.stockGrams,
        reservedGrams: materials.reservedGrams,
      })
      .from(materials)
      .where(eq(materials.id, material.id));
    assert.equal(stock?.stockGrams, '990.00');
    assert.equal(stock?.reservedGrams, '0.00');
    assert.equal(
      (
        await db
          .select()
          .from(materialStockMovements)
          .where(eq(materialStockMovements.refId, order.id))
      ).filter((movement) => movement.movementType === 'consume').length,
      1,
    );
    assert.equal(
      (await db.select().from(printJobs).where(eq(printJobs.orderId, order.id)))
        .length,
      1,
    );
    assert.equal(
      (
        await db
          .select({ status: discountRedemptions.status })
          .from(discountRedemptions)
          .where(eq(discountRedemptions.orderId, order.id))
      )[0]?.status,
      'confirmed',
    );

    const [tamperOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T063T${suffix}`,
        userId,
        itemsAmount: '20.00',
        payableAmount: '20.00',
        receiverName: '金额测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 2 号',
        reservedUntil: new Date(Date.now() + 30 * 60_000),
      })
      .returning({ id: orders.id });
    assert(tamperOrder);
    orderIds.push(tamperOrder.id);
    const [tamperPayment] = await db
      .insert(payments)
      .values({
        orderId: tamperOrder.id,
        outTradeNo: `TAMPER-${suffix}`,
        provider: 'mock',
        amount: '20.00',
      })
      .returning({ outTradeNo: payments.outTradeNo });
    assert(tamperPayment);
    assert.equal(
      await processPaymentNotify(new MockPaymentProvider(), {
        mock_signature: 'valid',
        out_trade_no: tamperPayment.outTradeNo,
        trade_no: `TAMPER-TXN-${suffix}`,
        total_amount: '0.01',
        trade_status: 'TRADE_SUCCESS',
      }),
      'failure',
    );
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, tamperOrder.id))
      )[0]?.status,
      'pending_payment',
    );

    const [cancelledOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T063C${suffix}`,
        userId,
        status: 'cancelled',
        itemsAmount: '30.00',
        payableAmount: '30.00',
        receiverName: '晚到回调',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 3 号',
        cancelledAt: new Date(),
        cancelReason: 'payment_timeout',
      })
      .returning({ id: orders.id });
    assert(cancelledOrder);
    orderIds.push(cancelledOrder.id);
    const [latePayment] = await db
      .insert(payments)
      .values({
        orderId: cancelledOrder.id,
        outTradeNo: `LATE-${suffix}`,
        provider: 'mock',
        amount: '30.00',
      })
      .returning({ id: payments.id, outTradeNo: payments.outTradeNo });
    assert(latePayment);
    assert.equal(
      await processPaymentNotify(new MockPaymentProvider(), {
        mock_signature: 'valid',
        out_trade_no: latePayment.outTradeNo,
        trade_no: `LATE-TXN-${suffix}`,
        total_amount: '30.00',
        trade_status: 'TRADE_SUCCESS',
      }),
      'success',
    );
    assert.equal(
      (
        await db
          .select({ needsManualReview: payments.needsManualReview })
          .from(payments)
          .where(eq(payments.id, latePayment.id))
      )[0]?.needsManualReview,
      true,
    );
  } finally {
    process.env.ENABLE_MOCK_PAYMENT = oldMockSetting;
    if (orderIds.length) {
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.refId, orderIds));
      await db.delete(payments).where(inArray(payments.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (promotionId) {
      await db
        .delete(discountCodes)
        .where(eq(discountCodes.promotionId, promotionId));
      await db.delete(promotions).where(eq(promotions.id, promotionId));
    }
    if (productId) {
      await db
        .delete(productVariants)
        .where(eq(productVariants.productId, productId));
      await db.delete(products).where(eq(products.id, productId));
    }
    if (materialId) {
      await db.delete(materials).where(eq(materials.id, materialId));
    }
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Payment functional test passed: duplicate creation, triple notify idempotency, amount guard, stock commit, discount confirmation, print job, and late-payment review.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Payment functional test failed: ${message}\n`);
  process.exitCode = 1;
});
