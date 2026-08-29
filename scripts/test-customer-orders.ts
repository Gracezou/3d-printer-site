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
  promotions,
  shipments,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  cancelCustomerOrder,
  confirmCustomerOrder,
  getCustomerOrderDetail,
  listCustomerOrders,
} from '@/lib/services/customer-order.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const orderIds: string[] = [];
  let materialId: string | undefined;
  let promotionId: string | undefined;

  try {
    const phoneTail = Date.now().toString().slice(-7);
    await db.insert(userProfiles).values([
      { id: userA, phone: `138${phoneTail}1` },
      { id: userB, phone: `139${phoneTail}2` },
    ]);
    const [material] = await db
      .insert(materials)
      .values({
        code: `T090-${suffix}`,
        name: `T090-SECRET-MATERIAL-${suffix}`,
        materialType: 'PLA',
        stockGrams: '100.00',
        reservedGrams: '0.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;
    const [promotion] = await db
      .insert(promotions)
      .values({
        name: `T090 取消回滚 ${suffix}`,
        discountType: 'fixed_amount',
        discountValue: '10.00',
      })
      .returning({ id: promotions.id });
    assert(promotion);
    promotionId = promotion.id;
    const [code] = await db
      .insert(discountCodes)
      .values({
        promotionId: promotion.id,
        code: `T090${suffix}`.toUpperCase(),
        codeType: 'permanent',
        maxUses: null,
        usedCount: 1,
      })
      .returning({ id: discountCodes.id, code: discountCodes.code });
    assert(code);

    const [pendingOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T090P${suffix}`,
        userId: userA,
        itemsAmount: '30.00',
        discountAmount: '10.00',
        payableAmount: '20.00',
        discountCodeId: code.id,
        discountCode: code.code,
        receiverName: '用户甲',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 5 号',
        buyerRemark: 'T090 用户备注',
        adminRemark: 'T090-SECRET-ADMIN-REMARK',
        reservedUntil: new Date(Date.now() + 30 * 60_000),
      })
      .returning({ id: orders.id, orderNo: orders.orderNo });
    assert(pendingOrder);
    orderIds.push(pendingOrder.id);
    await db.insert(orderItems).values({
      orderId: pendingOrder.id,
      productName: 'T090 测试商品',
      variantName: '待支付款',
      skuCode: `T090-P-${suffix}`,
      unitPrice: '30.00',
      quantity: 1,
      subtotal: '30.00',
      bomSnapshot: [
        {
          material_id: material.id,
          material_name: `T090-SECRET-MATERIAL-${suffix}`,
          grams: '10.00',
          waste_rate: '0.0000',
          required_grams: '10.00',
        },
      ],
    });
    await db.insert(discountRedemptions).values({
      codeId: code.id,
      promotionId: promotion.id,
      userId: userA,
      orderId: pendingOrder.id,
      discountAmount: '10.00',
      status: 'occupied',
    });
    await db.insert(payments).values({
      orderId: pendingOrder.id,
      outTradeNo: `T090-PAY-${suffix}`,
      provider: 'mock',
      amount: '20.00',
      status: 'pending',
    });
    await db.execute(
      sql`SELECT fn_reserve_order_stock(${pendingOrder.id}::uuid)`,
    );

    const [shippedOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T090S${suffix}`,
        userId: userA,
        status: 'shipped',
        itemsAmount: '40.00',
        payableAmount: '40.00',
        paidAmount: '40.00',
        receiverName: '用户甲',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 5 号',
        paidAt: new Date(),
        shippedAt: new Date(),
      })
      .returning({ id: orders.id, orderNo: orders.orderNo });
    assert(shippedOrder);
    orderIds.push(shippedOrder.id);
    const [shippedItem] = await db
      .insert(orderItems)
      .values({
        orderId: shippedOrder.id,
        productName: 'T090 已发货商品',
        variantName: '完成款',
        skuCode: `T090-S-${suffix}`,
        unitPrice: '40.00',
        quantity: 1,
        subtotal: '40.00',
        bomSnapshot: [],
      })
      .returning({ id: orderItems.id });
    assert(shippedItem);
    await db.insert(printJobs).values({
      orderId: shippedOrder.id,
      orderItemId: shippedItem.id,
      quantity: 1,
      status: 'done',
      finishedAt: new Date(),
    });
    await db.insert(shipments).values({
      orderId: shippedOrder.id,
      carrierCode: 'sf',
      carrierName: '顺丰速运',
      trackingNo: `SF${Date.now()}`,
      shippedAt: new Date(),
    });

    const [otherOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T090O${suffix}`,
        userId: userB,
        status: 'completed',
        itemsAmount: '50.00',
        payableAmount: '50.00',
        paidAmount: '50.00',
        receiverName: '用户乙',
        receiverPhone: '13900139000',
        receiverProvince: '广东省',
        receiverCity: '广州市',
        receiverDistrict: '天河区',
        receiverDetail: '测试路 6 号',
        paidAt: new Date(),
        completedAt: new Date(),
      })
      .returning({ id: orders.id, orderNo: orders.orderNo });
    assert(otherOrder);
    orderIds.push(otherOrder.id);

    const userAList = await listCustomerOrders(userA, {
      status: 'all',
      page: 1,
      pageSize: 10,
    });
    assert.equal(userAList.total, 2);
    assert(
      !userAList.list.some((order) => order.orderNo === otherOrder.orderNo),
    );

    const detail = await getCustomerOrderDetail(userA, pendingOrder.orderNo);
    assert.equal(detail.receiver.phone, '138****8000');
    assert.equal(detail.buyerRemark, 'T090 用户备注');
    const serialized = JSON.stringify(detail);
    assert(!serialized.includes('bomSnapshot'));
    assert(!serialized.includes('material'));
    assert(!serialized.includes(`T090-SECRET-MATERIAL-${suffix}`));
    assert(!serialized.includes('adminRemark'));
    assert(!serialized.includes('T090-SECRET-ADMIN-REMARK'));

    await assert.rejects(
      () => getCustomerOrderDetail(userB, pendingOrder.orderNo),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40401);
        return true;
      },
    );
    await assert.rejects(() =>
      cancelCustomerOrder(userB, pendingOrder.orderNo),
    );

    await cancelCustomerOrder(userA, pendingOrder.orderNo);
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, pendingOrder.id))
      )[0]?.status,
      'cancelled',
    );
    assert.equal(
      (
        await db
          .select({ reservedGrams: materials.reservedGrams })
          .from(materials)
          .where(eq(materials.id, material.id))
      )[0]?.reservedGrams,
      '0.00',
    );
    assert.equal(
      (
        await db
          .select({ usedCount: discountCodes.usedCount })
          .from(discountCodes)
          .where(eq(discountCodes.id, code.id))
      )[0]?.usedCount,
      0,
    );
    assert.equal(
      (
        await db
          .select({ status: payments.status })
          .from(payments)
          .where(eq(payments.orderId, pendingOrder.id))
      )[0]?.status,
      'closed',
    );

    const shippedDetail = await getCustomerOrderDetail(
      userA,
      shippedOrder.orderNo,
    );
    assert.equal(shippedDetail.items[0]?.printStatus, 'done');
    assert.equal(shippedDetail.shipment?.trackingNo.startsWith('SF'), true);
    await assert.rejects(() =>
      confirmCustomerOrder(userB, shippedOrder.orderNo),
    );
    await confirmCustomerOrder(userA, shippedOrder.orderNo);
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, shippedOrder.id))
      )[0]?.status,
      'completed',
    );
  } finally {
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
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    await db
      .delete(userProfiles)
      .where(inArray(userProfiles.id, [userA, userB]));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Customer-order functional test passed: ownership isolation, safe response fields, cancellation rollback, payment closure, production detail, shipment, and delivery confirmation.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Customer-order test failed: ${message}\n`);
  process.exitCode = 1;
});
