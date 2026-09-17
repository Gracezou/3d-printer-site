import assert from 'node:assert/strict';

import { and, eq, sql } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminRoles,
  adminUsers,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  refundItems,
  refunds,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { returnRefundItemStock } from '@/lib/services/refund-stock.service';
import { assertLocalDatabaseUrl } from './assert-local-database';

class RollbackAfterAssertions extends Error {}

async function main(): Promise<void> {
  assertLocalDatabaseUrl();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      const [role] = await tx
        .insert(adminRoles)
        .values({ code: `t201_${suffix}`, name: 'T201 退款测试角色' })
        .returning({ id: adminRoles.id });
      assert(role);
      const [admin] = await tx
        .insert(adminUsers)
        .values({
          username: `t201_${suffix}`,
          passwordHash: 'transaction-only',
          name: 'T201 退款测试管理员',
          roleId: role.id,
        })
        .returning({ id: adminUsers.id });
      assert(admin);

      const userId = crypto.randomUUID();
      await tx.insert(userProfiles).values({ id: userId });
      const [firstMaterial, secondMaterial] = await tx
        .insert(materials)
        .values([
          {
            code: `T201-A-${suffix}`,
            name: 'T201 旧快照 A',
            materialType: 'PLA',
            stockGrams: '90.00',
            wasteRate: '0.0000',
          },
          {
            code: `T201-B-${suffix}`,
            name: 'T201 旧快照 B',
            materialType: 'PLA',
            stockGrams: '190.00',
            wasteRate: '0.0000',
          },
        ])
        .returning({ id: materials.id });
      assert(firstMaterial && secondMaterial);

      const [product] = await tx
        .insert(products)
        .values({ name: 'T201 库存视图测试商品', slug: `t201-${suffix}` })
        .returning({ id: products.id });
      assert(product);
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: product.id,
          skuCode: `T201-V-${suffix}`,
          name: '标准款',
          price: '10.00',
        })
        .returning({ id: productVariants.id });
      assert(variant);
      await tx.insert(variantMaterials).values({
        variantId: variant.id,
        materialId: firstMaterial.id,
        grams: '5.00',
      });
      const [changedVariant] = await tx
        .insert(productVariants)
        .values({
          productId: product.id,
          skuCode: `T201-CHANGED-${suffix}`,
          name: 'BOM 已修改的款式',
          price: '10.00',
        })
        .returning({ id: productVariants.id });
      assert(changedVariant);
      await tx.insert(variantMaterials).values({
        variantId: changedVariant.id,
        materialId: firstMaterial.id,
        grams: '99.00',
      });
      const availability = async () => {
        const [row] = await tx
          .select({
            availableQty: sql<number>`(SELECT available_qty FROM v_variant_availability WHERE variant_id = ${variant.id})`,
          })
          .from(productVariants)
          .where(eq(productVariants.id, variant.id));
        return row?.availableQty;
      };
      assert.equal(await availability(), 18);

      const [order] = await tx
        .insert(orders)
        .values({
          orderNo: `T201${suffix}`,
          userId,
          status: 'paid',
          itemsAmount: '20.00',
          payableAmount: '20.00',
          paidAmount: '20.00',
          receiverName: '退款测试',
          receiverPhone: '13800138000',
          receiverProvince: '广东省',
          receiverCity: '深圳市',
          receiverDistrict: '南山区',
          receiverDetail: '事务回滚测试地址',
        })
        .returning({ id: orders.id });
      assert(order);
      const [orderItem] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          variantId: changedVariant.id,
          productName: '快照返库测试商品',
          variantName: '标准',
          skuCode: `T201-${suffix}`,
          unitPrice: '10.00',
          quantity: 2,
          subtotal: '20.00',
          bomSnapshot: [
            {
              material_id: secondMaterial.id,
              material_name: '旧版 B',
              grams: '2.50',
              waste_rate: '0.0000',
              required_grams: '2.50',
            },
            {
              material_id: firstMaterial.id,
              material_name: '旧版 A',
              grams: '5.00',
              waste_rate: '0.0000',
              required_grams: '5.00',
            },
          ],
        })
        .returning({ id: orderItems.id });
      assert(orderItem);
      const [payment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          outTradeNo: `T201-P-${suffix}`,
          provider: 'mock',
          amount: '20.00',
          status: 'success',
        })
        .returning({ id: payments.id });
      assert(payment);
      const [refund] = await tx
        .insert(refunds)
        .values({
          orderId: order.id,
          paymentId: payment.id,
          outRefundNo: `T201-R-${suffix}`,
          amount: '10.00',
          isFullRefund: false,
          status: 'success',
          operatorId: admin.id,
        })
        .returning({ id: refunds.id });
      assert(refund);
      const [line] = await tx
        .insert(refundItems)
        .values({
          refundId: refund.id,
          orderItemId: orderItem.id,
          quantity: 1,
          itemsAmount: '10.00',
          discountShare: '0.00',
          shippingShare: '0.00',
          amount: '10.00',
          restock: true,
        })
        .returning({ id: refundItems.id });
      assert(line);

      const firstPass = await returnRefundItemStock(tx, line.id, admin.id);
      const secondPass = await returnRefundItemStock(tx, line.id, admin.id);
      assert.equal(firstPass.length, 2);
      assert.deepEqual(secondPass, firstPass);

      const stock = await tx
        .select({ id: materials.id, stockGrams: materials.stockGrams })
        .from(materials)
        .where(eq(materials.id, firstMaterial.id));
      assert.equal(stock[0]?.stockGrams, '95.00');
      assert.equal(await availability(), 19);
      const movements = await tx
        .select({
          materialId: materialStockMovements.materialId,
          delta: materialStockMovements.deltaStockGrams,
        })
        .from(materialStockMovements)
        .where(
          and(
            eq(materialStockMovements.refType, 'refund_item'),
            eq(materialStockMovements.refId, line.id),
          ),
        );
      assert.equal(movements.length, 2);
      assert.equal(
        movements.find((movement) => movement.materialId === secondMaterial.id)
          ?.delta,
        '2.50',
      );

      const makeExtraLine = async (
        tag: string,
        status: 'success' | 'failed',
        restock: boolean,
      ) => {
        const [extraRefund] = await tx
          .insert(refunds)
          .values({
            orderId: order.id,
            paymentId: payment.id,
            outRefundNo: `T201-${tag}-${suffix}`,
            amount: '10.00',
            isFullRefund: false,
            status,
            operatorId: admin.id,
          })
          .returning({ id: refunds.id });
        assert(extraRefund);
        const [extraLine] = await tx
          .insert(refundItems)
          .values({
            refundId: extraRefund.id,
            orderItemId: orderItem.id,
            quantity: 1,
            itemsAmount: '10.00',
            discountShare: '0.00',
            shippingShare: '0.00',
            amount: '10.00',
            restock,
          })
          .returning({ id: refundItems.id });
        assert(extraLine);
        return extraLine.id;
      };

      const noRestockLine = await makeExtraLine('NO', 'success', false);
      assert.deepEqual(
        await returnRefundItemStock(tx, noRestockLine, admin.id),
        [],
      );
      const failedLine = await makeExtraLine('FAIL', 'failed', true);
      await assert.rejects(
        () => returnRefundItemStock(tx, failedLine, admin.id),
        /退款未成功/,
      );
      const [unchanged] = await tx
        .select({ stockGrams: materials.stockGrams })
        .from(materials)
        .where(eq(materials.id, firstMaterial.id));
      assert.equal(unchanged?.stockGrams, '95.00');

      // Every fixture write, including stock and movement changes, rolls back.
      throw new RollbackAfterAssertions();
    });
  } catch (error: unknown) {
    if (!(error instanceof RollbackAfterAssertions)) throw error;
    process.stdout.write(
      'Refund item stock test passed: partial BOM return, availability, idempotency, negative cases, transaction rollback.\n',
    );
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Refund item stock test failed: ${message}\n`);
  process.exitCode = 1;
});
