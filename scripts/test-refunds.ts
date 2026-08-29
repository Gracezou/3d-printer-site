import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  discountCodes,
  discountRedemptions,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  promotions,
  refunds,
  userProfiles,
} from '@/lib/db/schema';
import { refundOrder } from '@/lib/services/refund.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const orderIds: string[] = [];
  let adminId: string | undefined;
  let roleId: string | undefined;
  let materialId: string | undefined;
  let promotionId: string | undefined;
  const oldMockSetting = process.env.ENABLE_MOCK_PAYMENT;
  process.env.ENABLE_MOCK_PAYMENT = 'true';

  try {
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: `t071_refund_${suffix}`,
        name: 'T071 退款测试角色',
        permissions: ['order:view', 'order:refund'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    assert(role);
    roleId = role.id;
    const [admin] = await db
      .insert(adminUsers)
      .values({
        username: `t071_${suffix}`,
        passwordHash: 'test-only',
        name: 'T071 退款测试管理员',
        roleId: role.id,
      })
      .returning({ id: adminUsers.id, username: adminUsers.username });
    assert(admin);
    adminId = admin.id;
    const identity = {
      sub: admin.id,
      username: admin.username,
      name: 'T071 退款测试管理员',
      roleCode: role.code,
      permissions: ['order:view', 'order:refund'],
    };

    await db.insert(userProfiles).values({
      id: userId,
      phone: `132${suffix.slice(0, 8)}`,
    });
    const [material] = await db
      .insert(materials)
      .values({
        code: `T071-${suffix}`,
        name: 'T071 退款测试耗材',
        materialType: 'PLA',
        stockGrams: '990.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;

    const [promotion] = await db
      .insert(promotions)
      .values({
        name: `T071 退款折扣 ${suffix}`,
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
        code: `T071${suffix}`.toUpperCase(),
        codeType: 'permanent',
        maxUses: null,
        usedCount: 1,
      })
      .returning({ id: discountCodes.id, code: discountCodes.code });
    assert(code);

    const [fullOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T071F${suffix}`,
        userId,
        status: 'paid',
        itemsAmount: '100.00',
        discountAmount: '10.00',
        payableAmount: '90.00',
        paidAmount: '90.00',
        discountCodeId: code.id,
        discountCode: code.code,
        receiverName: '全额退款测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 1 号',
        paidAt: new Date(),
      })
      .returning({ id: orders.id, orderNo: orders.orderNo });
    assert(fullOrder);
    orderIds.push(fullOrder.id);
    await db.insert(orderItems).values({
      orderId: fullOrder.id,
      productName: '全额退款测试商品',
      variantName: '标准款',
      skuCode: `T071-${suffix}`,
      unitPrice: '100.00',
      quantity: 1,
      subtotal: '100.00',
      bomSnapshot: [
        {
          material_id: material.id,
          material_name: 'T071 退款测试耗材',
          grams: '10.00',
          waste_rate: '0.0000',
          required_grams: '10.00',
        },
      ],
    });
    await db.insert(discountRedemptions).values({
      codeId: code.id,
      promotionId: promotion.id,
      userId,
      orderId: fullOrder.id,
      discountAmount: '10.00',
      status: 'confirmed',
    });
    await db.insert(payments).values({
      orderId: fullOrder.id,
      outTradeNo: `T071-FULL-${suffix}`,
      provider: 'mock',
      amount: '90.00',
      status: 'success',
      paidAt: new Date(),
    });

    const fullResult = await refundOrder(
      fullOrder.id,
      { amount: '90.00', reason: '全额退款回归测试', restock: true },
      { admin: identity, ip: '127.0.0.1' },
    );
    assert.equal(fullResult.isFullRefund, true);
    assert.equal(fullResult.restock, true);
    const [fullOrderAfter] = await db
      .select({ status: orders.status, refundedAmount: orders.refundedAmount })
      .from(orders)
      .where(eq(orders.id, fullOrder.id));
    assert.equal(fullOrderAfter?.status, 'refunded');
    assert.equal(fullOrderAfter?.refundedAmount, '90.00');
    assert.equal(
      (
        await db
          .select({ status: payments.status })
          .from(payments)
          .where(eq(payments.orderId, fullOrder.id))
      )[0]?.status,
      'refunded',
    );
    assert.equal(
      (
        await db
          .select({ stockGrams: materials.stockGrams })
          .from(materials)
          .where(eq(materials.id, material.id))
      )[0]?.stockGrams,
      '1000.00',
    );
    assert.equal(
      (
        await db
          .select()
          .from(materialStockMovements)
          .where(eq(materialStockMovements.refId, fullOrder.id))
      ).filter((row) => row.movementType === 'refund_return').length,
      1,
    );
    assert.equal(
      (
        await db
          .select({ status: discountRedemptions.status })
          .from(discountRedemptions)
          .where(eq(discountRedemptions.orderId, fullOrder.id))
      )[0]?.status,
      'released',
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

    const [partialOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T071P${suffix}`,
        userId,
        status: 'paid',
        itemsAmount: '100.00',
        payableAmount: '100.00',
        paidAmount: '100.00',
        receiverName: '部分退款测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 2 号',
        paidAt: new Date(),
      })
      .returning({ id: orders.id });
    assert(partialOrder);
    orderIds.push(partialOrder.id);
    await db.insert(payments).values({
      orderId: partialOrder.id,
      outTradeNo: `T071-PART-${suffix}`,
      provider: 'mock',
      amount: '100.00',
      status: 'success',
      paidAt: new Date(),
    });

    const partialResult = await refundOrder(
      partialOrder.id,
      { amount: '20.00', reason: '部分退款回归测试', restock: true },
      { admin: identity, ip: '127.0.0.1' },
    );
    assert.equal(partialResult.isFullRefund, false);
    assert.equal(partialResult.restock, false);
    const [partialOrderAfter] = await db
      .select({ status: orders.status, refundedAmount: orders.refundedAmount })
      .from(orders)
      .where(eq(orders.id, partialOrder.id));
    assert.equal(partialOrderAfter?.status, 'refunded');
    assert.equal(partialOrderAfter?.refundedAmount, '20.00');
    assert.equal(
      (
        await db
          .select({ status: payments.status })
          .from(payments)
          .where(eq(payments.orderId, partialOrder.id))
      )[0]?.status,
      'success',
    );
    assert.equal(
      (
        await db
          .select({ restock: refunds.restock })
          .from(refunds)
          .where(eq(refunds.orderId, partialOrder.id))
      )[0]?.restock,
      false,
    );
    await assert.rejects(() =>
      refundOrder(
        partialOrder.id,
        { amount: '80.01', reason: '超额退款测试', restock: false },
        { admin: identity, ip: '127.0.0.1' },
      ),
    );
  } finally {
    process.env.ENABLE_MOCK_PAYMENT = oldMockSetting;
    if (orderIds.length) {
      await db
        .delete(adminOperationLogs)
        .where(inArray(adminOperationLogs.targetId, orderIds));
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.refId, orderIds));
      await db.delete(refunds).where(inArray(refunds.orderId, orderIds));
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
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    if (adminId) await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    if (roleId) await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Refund functional test passed: full refund, stock return, discount release, partial refund, and over-refund guard.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Refund functional test failed: ${message}\n`);
  process.exitCode = 1;
});
