import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';

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
  printJobs,
  promotions,
  refundItems,
  refunds,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import type { PaymentProvider } from '@/lib/services/payment/provider.interface';
import { refundOrder } from '@/lib/services/refund.service';

function fakeProvider(options?: { fail?: boolean; delayMs?: number }): {
  provider: PaymentProvider;
  refundCalls: () => number;
} {
  let calls = 0;
  const completed = new Map<string, string>();
  return {
    refundCalls: () => calls,
    provider: {
      code: 'mock',
      async createPayment() {
        return { payUrl: 'http://localhost/mock' };
      },
      async queryPayment() {
        return { status: 'pending' as const };
      },
      async verifyNotify() {
        return { valid: false, raw: {} };
      },
      async refund(params) {
        calls += 1;
        if (options?.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (options?.fail) return { success: false, message: '模拟渠道拒绝' };
        const providerRefundId =
          completed.get(params.outRefundNo) ?? `FAKE-${params.outRefundNo}`;
        completed.set(params.outRefundNo, providerRefundId);
        return { success: true, providerRefundId };
      },
      async queryRefund(params) {
        const providerRefundId = completed.get(params.outRefundNo);
        return providerRefundId
          ? { status: 'success' as const, providerRefundId }
          : { status: 'not_found' as const };
      },
    },
  };
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const orderIds: string[] = [];
  const materialIds: string[] = [];
  let adminId: string | undefined;
  let roleId: string | undefined;
  let promotionId: string | undefined;

  try {
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: `b2_refund_${suffix}`,
        name: 'B2 退款测试角色',
        permissions: ['order:view', 'order:refund'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    assert(role);
    roleId = role.id;
    const [admin] = await db
      .insert(adminUsers)
      .values({
        username: `b2_${suffix}`,
        passwordHash: 'test-only',
        name: 'B2 退款测试管理员',
        roleId: role.id,
      })
      .returning({ id: adminUsers.id, username: adminUsers.username });
    assert(admin);
    adminId = admin.id;
    const identity = {
      sub: admin.id,
      username: admin.username,
      name: 'B2 退款测试管理员',
      roleCode: role.code,
      permissions: ['order:view', 'order:refund'],
    };
    const context = { admin: identity, ip: '127.0.0.1' };

    await db.insert(userProfiles).values({
      id: userId,
      phone: `132${suffix.slice(0, 8)}`,
    });
    const [material] = await db
      .insert(materials)
      .values({
        code: `B2-${suffix}`,
        name: 'B2 退款测试耗材',
        materialType: 'PLA',
        stockGrams: '900.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialIds.push(material.id);

    const [promotion] = await db
      .insert(promotions)
      .values({
        name: `B2 退款折扣 ${suffix}`,
        discountType: 'fixed_amount',
        discountValue: '17.00',
      })
      .returning({ id: promotions.id });
    assert(promotion);
    promotionId = promotion.id;
    const [code] = await db
      .insert(discountCodes)
      .values({
        promotionId: promotion.id,
        code: `B2${suffix}`.toUpperCase(),
        codeType: 'permanent',
        maxUses: null,
        usedCount: 1,
      })
      .returning({ id: discountCodes.id, code: discountCodes.code });
    assert(code);

    const [mainOrder] = await db
      .insert(orders)
      .values({
        orderNo: `B2MAIN${suffix}`,
        userId,
        status: 'in_production',
        itemsAmount: '120.00',
        discountAmount: '17.00',
        shippingAmount: '8.00',
        payableAmount: '111.00',
        paidAmount: '111.00',
        discountCodeId: code.id,
        discountCode: code.code,
        receiverName: '商品级退款测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 1 号',
        paidAt: new Date(),
      })
      .returning({ id: orders.id });
    assert(mainOrder);
    orderIds.push(mainOrder.id);
    await db.insert(discountRedemptions).values({
      codeId: code.id,
      promotionId: promotion.id,
      userId,
      orderId: mainOrder.id,
      discountAmount: '17.00',
      status: 'confirmed',
    });
    const mainItems = await db
      .insert(orderItems)
      .values(
        [
          ['19.99', 'queued', '1.00'],
          ['40.01', 'printing', '2.00'],
          ['60.00', 'done', '3.00'],
        ].map(([subtotal], index) => ({
          orderId: mainOrder.id,
          productName: `退款测试商品 ${index + 1}`,
          variantName: '标准款',
          skuCode: `B2-${suffix}-${index + 1}`,
          unitPrice: subtotal,
          quantity: 1,
          subtotal,
          bomSnapshot: [
            {
              material_id: material.id,
              material_name: 'B2 退款测试耗材',
              grams: `${index + 1}.00`,
              waste_rate: '0.0000',
              required_grams: `${index + 1}.00`,
            },
          ],
        })),
      )
      .returning({ id: orderItems.id });
    assert.equal(mainItems.length, 3);
    await db.insert(printJobs).values(
      mainItems.map((item, index) => ({
        orderId: mainOrder.id,
        orderItemId: item.id,
        quantity: 1,
        status: ['queued', 'printing', 'done'][index],
      })),
    );
    await db.insert(payments).values({
      orderId: mainOrder.id,
      outTradeNo: `B2-MAIN-${suffix}`,
      provider: 'mock',
      amount: '111.00',
      status: 'success',
      paidAt: new Date(),
    });

    const mainProvider = fakeProvider();
    const firstInput = {
      idempotencyKey: `b2:first:${suffix}`,
      reason: '商品 1 退款',
      items: [{ orderItemId: mainItems[0]!.id, quantity: 1, restock: true }],
    };
    const first = await refundOrder(mainOrder.id, firstInput, context, {
      getProvider: () => mainProvider.provider,
    });
    assert.equal(first.isFullRefund, false);
    assert.equal(first.items[0]?.shippingShare, '0.00');
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, mainOrder.id))
      )[0]?.status,
      'in_production',
      '96126c5: partial refund must preserve the pre-refund order state',
    );
    assert.equal(
      (
        await db
          .select({ id: printJobs.id })
          .from(printJobs)
          .where(eq(printJobs.orderItemId, mainItems[0]!.id))
      ).length,
      0,
      'queued print job must leave the queue only after success',
    );
    assert.equal(
      (
        await db
          .select({ stock: materials.stockGrams })
          .from(materials)
          .where(eq(materials.id, material.id))
      )[0]?.stock,
      '901.00',
    );

    const replay = await refundOrder(mainOrder.id, firstInput, context, {
      getProvider: () => mainProvider.provider,
    });
    assert.equal(replay.id, first.id);
    assert.equal(mainProvider.refundCalls(), 1);
    assert.equal(
      (
        await db
          .select({ id: refunds.id })
          .from(refunds)
          .where(eq(refunds.orderId, mainOrder.id))
      ).length,
      1,
    );
    assert.equal(
      (
        await db
          .select({ id: materialStockMovements.id })
          .from(materialStockMovements)
          .where(eq(materialStockMovements.refType, 'refund_item'))
      ).filter((row) => row.id).length >= 1,
      true,
    );

    const second = await refundOrder(
      mainOrder.id,
      {
        idempotencyKey: `b2:second:${suffix}`,
        reason: '商品 2 退款',
        items: [{ orderItemId: mainItems[1]!.id, quantity: 1, restock: false }],
      },
      context,
      { getProvider: () => mainProvider.provider },
    );
    assert.equal(second.isFullRefund, false);
    assert.equal(
      (
        await db
          .select({ status: printJobs.status })
          .from(printJobs)
          .where(eq(printJobs.orderItemId, mainItems[1]!.id))
      )[0]?.status,
      'printing',
    );
    await assert.rejects(
      () =>
        refundOrder(
          mainOrder.id,
          {
            idempotencyKey: `b2:over:${suffix}`,
            reason: '商品 2 超额退款',
            items: [
              {
                orderItemId: mainItems[1]!.id,
                quantity: 1,
                restock: false,
              },
            ],
          },
          context,
          { getProvider: () => mainProvider.provider },
        ),
      (error: unknown) => error instanceof BizError && error.code === 40918,
    );

    const third = await refundOrder(
      mainOrder.id,
      {
        idempotencyKey: `b2:third:${suffix}`,
        reason: '商品 3 退款',
        items: [{ orderItemId: mainItems[2]!.id, quantity: 1, restock: true }],
      },
      context,
      { getProvider: () => mainProvider.provider },
    );
    assert.equal(third.isFullRefund, true);
    assert.equal(third.items[0]?.shippingShare, '8.00');
    assert.equal(
      [first, second, third]
        .reduce((sum, result) => sum.plus(result.amount), new Decimal(0))
        .toFixed(2),
      '111.00',
      'three differently priced items plus discount and shipping must reconcile exactly',
    );
    const [mainOrderAfter] = await db
      .select({ status: orders.status, refunded: orders.refundedAmount })
      .from(orders)
      .where(eq(orders.id, mainOrder.id));
    assert.equal(mainOrderAfter?.status, 'refunded');
    assert.equal(mainOrderAfter?.refunded, '111.00');
    assert.equal(
      (
        await db
          .select({ status: printJobs.status })
          .from(printJobs)
          .where(eq(printJobs.orderItemId, mainItems[2]!.id))
      )[0]?.status,
      'done',
    );
    assert.equal(
      (
        await db
          .select({ status: discountRedemptions.status })
          .from(discountRedemptions)
          .where(eq(discountRedemptions.orderId, mainOrder.id))
      )[0]?.status,
      'released',
    );

    async function createSingleOrder(tag: string, materialId = material.id) {
      const [order] = await db
        .insert(orders)
        .values({
          orderNo: `B2${tag}${suffix}`,
          userId,
          status: 'paid',
          itemsAmount: '10.00',
          payableAmount: '10.00',
          paidAmount: '10.00',
          receiverName: `${tag} 测试`,
          receiverPhone: '13800138000',
          receiverProvince: '广东省',
          receiverCity: '深圳市',
          receiverDistrict: '南山区',
          receiverDetail: '测试路 2 号',
          paidAt: new Date(),
        })
        .returning({ id: orders.id });
      assert(order);
      orderIds.push(order.id);
      const [item] = await db
        .insert(orderItems)
        .values({
          orderId: order.id,
          productName: `${tag} 商品`,
          variantName: '标准款',
          skuCode: `B2-${tag}-${suffix}`,
          unitPrice: '10.00',
          quantity: 1,
          subtotal: '10.00',
          bomSnapshot: [
            {
              material_id: materialId,
              material_name: `${tag} 耗材`,
              grams: '1.00',
              waste_rate: '0.0000',
              required_grams: '1.00',
            },
          ],
        })
        .returning({ id: orderItems.id });
      assert(item);
      await db.insert(printJobs).values({
        orderId: order.id,
        orderItemId: item.id,
        quantity: 1,
        status: 'queued',
      });
      await db.insert(payments).values({
        orderId: order.id,
        outTradeNo: `B2-${tag}-PAY-${suffix}`,
        provider: 'mock',
        amount: '10.00',
        status: 'success',
        paidAt: new Date(),
      });
      return { order, item };
    }

    const concurrent = await createSingleOrder('CON');
    const concurrentProvider = fakeProvider({ delayMs: 40 });
    const concurrentResults = await Promise.allSettled(
      ['A', 'B'].map((key) =>
        refundOrder(
          concurrent.order.id,
          {
            idempotencyKey: `b2:concurrent:${key}:${suffix}`,
            reason: '并发退款',
            items: [
              {
                orderItemId: concurrent.item.id,
                quantity: 1,
                restock: false,
              },
            ],
          },
          context,
          { getProvider: () => concurrentProvider.provider },
        ),
      ),
    );
    assert.equal(
      concurrentResults.filter((result) => result.status === 'fulfilled')
        .length,
      1,
      'only one concurrent refund may succeed for the same item',
    );
    assert.equal(concurrentProvider.refundCalls(), 1);

    const failed = await createSingleOrder('FAIL');
    const failedProvider = fakeProvider({ fail: true });
    await assert.rejects(() =>
      refundOrder(
        failed.order.id,
        {
          idempotencyKey: `b2:failed:${suffix}`,
          reason: '渠道失败',
          items: [{ orderItemId: failed.item.id, quantity: 1, restock: true }],
        },
        context,
        { getProvider: () => failedProvider.provider },
      ),
    );
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, failed.order.id))
      )[0]?.status,
      'paid',
    );
    assert.equal(
      (
        await db
          .select({ status: printJobs.status })
          .from(printJobs)
          .where(eq(printJobs.orderItemId, failed.item.id))
      )[0]?.status,
      'queued',
      'provider failure must not mutate the print queue',
    );

    const missingMaterialId = crypto.randomUUID();
    const recovery = await createSingleOrder('REC', missingMaterialId);
    const recoveryProvider = fakeProvider();
    const recoveryInput = {
      idempotencyKey: `b2:recovery:${suffix}`,
      reason: '渠道成功后本地续记',
      items: [{ orderItemId: recovery.item.id, quantity: 1, restock: true }],
    };
    await assert.rejects(() =>
      refundOrder(recovery.order.id, recoveryInput, context, {
        getProvider: () => recoveryProvider.provider,
      }),
    );
    const [pendingRecovery] = await db
      .select({
        status: refunds.status,
        providerConfirmedAt: refunds.providerConfirmedAt,
      })
      .from(refunds)
      .where(eq(refunds.orderId, recovery.order.id));
    assert.equal(pendingRecovery?.status, 'pending');
    assert(pendingRecovery?.providerConfirmedAt);
    assert.equal(
      (
        await db
          .select({ status: printJobs.status })
          .from(printJobs)
          .where(eq(printJobs.orderItemId, recovery.item.id))
      )[0]?.status,
      'queued',
      'failed local commit must roll back queue and stock changes',
    );
    await db.insert(materials).values({
      id: missingMaterialId,
      code: `B2-REC-${suffix}`,
      name: 'B2 恢复测试耗材',
      materialType: 'PLA',
      stockGrams: '10.00',
      wasteRate: '0.0000',
    });
    materialIds.push(missingMaterialId);
    const recovered = await refundOrder(
      recovery.order.id,
      recoveryInput,
      context,
      { getProvider: () => recoveryProvider.provider },
    );
    assert.equal(recovered.status, 'success');
    assert.equal(recoveryProvider.refundCalls(), 1);
    assert.equal(
      (
        await db
          .select({ id: refunds.id })
          .from(refunds)
          .where(eq(refunds.orderId, recovery.order.id))
      ).length,
      1,
      'recovery must reuse the original refund and out-refund number',
    );

    process.stdout.write(
      'Refund B2 test passed: exact allocation, per-item restock, queue linkage, partial-state regression, idempotent replay, concurrency, over-refund, provider failure, and confirmed-provider recovery.\n',
    );
  } finally {
    if (orderIds.length) {
      await db
        .delete(adminOperationLogs)
        .where(inArray(adminOperationLogs.targetId, orderIds));
      const refundRows = await db
        .select({ id: refunds.id })
        .from(refunds)
        .where(inArray(refunds.orderId, orderIds));
      const refundIds = refundRows.map((row) => row.id);
      if (refundIds.length) {
        const itemRows = await db
          .select({ id: refundItems.id })
          .from(refundItems)
          .where(inArray(refundItems.refundId, refundIds));
        const refundItemIds = itemRows.map((row) => row.id);
        if (refundItemIds.length) {
          await db
            .delete(materialStockMovements)
            .where(
              and(
                eq(materialStockMovements.refType, 'refund_item'),
                inArray(materialStockMovements.refId, refundItemIds),
              ),
            );
        }
        await db
          .delete(refundItems)
          .where(inArray(refundItems.refundId, refundIds));
      }
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
    if (materialIds.length) {
      await db.delete(materials).where(inArray(materials.id, materialIds));
    }
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    if (adminId) await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    if (roleId) await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Refund B2 test failed: ${message}\n`);
  process.exitCode = 1;
});
