import assert from 'node:assert/strict';

import Decimal from 'decimal.js';
import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  printJobs,
  userProfiles,
} from '@/lib/db/schema';
import { getAdminDashboard } from '@/lib/services/dashboard.service';
import {
  completePrintJob,
  failPrintJob,
  listPrintJobs,
  postProcessPrintJob,
  startPrintJob,
} from '@/lib/services/production.service';

async function main(): Promise<void> {
  const db = getDb();
  const baseline = await getAdminDashboard();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  let roleId: string | undefined;
  let adminId: string | undefined;
  let materialId: string | undefined;
  let orderId: string | undefined;

  try {
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: `t072_${suffix}`,
        name: 'T072 生产测试角色',
        permissions: ['production:view', 'production:update'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    assert(role);
    roleId = role.id;
    const [admin] = await db
      .insert(adminUsers)
      .values({
        username: `t072_${suffix}`,
        passwordHash: 'test-only',
        name: 'T072 生产测试管理员',
        roleId: role.id,
      })
      .returning({ id: adminUsers.id, username: adminUsers.username });
    assert(admin);
    adminId = admin.id;
    const context = {
      admin: {
        sub: admin.id,
        username: admin.username,
        name: 'T072 生产测试管理员',
        roleCode: role.code,
        permissions: ['production:view', 'production:update'],
      },
      ip: '127.0.0.1',
    };

    await db.insert(userProfiles).values({
      id: userId,
      phone: `131${suffix.slice(0, 8)}`,
    });
    const [material] = await db
      .insert(materials)
      .values({
        code: `T072-${suffix}`,
        name: 'T072 低库存测试耗材',
        materialType: 'PLA',
        stockGrams: '100.00',
        reservedGrams: '0.00',
        safetyGrams: '110.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;
    const [order] = await db
      .insert(orders)
      .values({
        orderNo: `T072${suffix}`,
        userId,
        status: 'in_production',
        itemsAmount: '12.00',
        payableAmount: '12.00',
        paidAmount: '12.00',
        receiverName: '生产测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 3 号',
        paidAt: new Date(),
      })
      .returning({ id: orders.id });
    assert(order);
    orderId = order.id;
    const itemValues = [
      { name: '批量款', quantity: 2 },
      { name: '单件款', quantity: 1 },
    ];
    const items = await db
      .insert(orderItems)
      .values(
        itemValues.map((item, index) => ({
          orderId: order.id,
          productName: 'T072 生产测试商品',
          variantName: item.name,
          skuCode: `T072-${index}-${suffix}`,
          unitPrice: '6.00',
          quantity: item.quantity,
          subtotal: index === 0 ? '6.00' : '6.00',
          bomSnapshot: [
            {
              material_id: material.id,
              material_name: 'T072 低库存测试耗材',
              grams: '10.00',
              waste_rate: '0.0000',
              required_grams: '10.00',
            },
          ],
        })),
      )
      .returning({ id: orderItems.id, quantity: orderItems.quantity });
    assert.equal(items.length, 2);
    const jobs = await db
      .insert(printJobs)
      .values(
        items.map((item) => ({
          orderId: order.id,
          orderItemId: item.id,
          quantity: item.quantity,
        })),
      )
      .returning({ id: printJobs.id });
    assert.equal(jobs.length, 2);
    await db.insert(payments).values({
      orderId: order.id,
      outTradeNo: `T072-REVIEW-${suffix}`,
      provider: 'mock',
      amount: '12.00',
      status: 'success',
      needsManualReview: true,
      paidAt: new Date(),
    });

    const filtered = await listPrintJobs({
      materialId: material.id,
      page: 1,
      pageSize: 100,
    });
    assert.equal(
      filtered.list.filter((job) => job.orderId === order.id).length,
      2,
    );
    assert.equal(
      filtered.list.find((job) => job.id === jobs[0]?.id)?.materials[0]
        ?.requiredGrams,
      '20.00',
    );

    const dashboardDuringProduction = await getAdminDashboard();
    assert.equal(
      dashboardDuringProduction.todayOrderCount,
      baseline.todayOrderCount + 1,
    );
    assert.equal(
      new Decimal(dashboardDuringProduction.todaySalesAmount).toFixed(2),
      new Decimal(baseline.todaySalesAmount).add(12).toFixed(2),
    );
    assert.equal(
      dashboardDuringProduction.pendingProductionCount,
      baseline.pendingProductionCount + 2,
    );
    assert.equal(
      dashboardDuringProduction.needsReviewPaymentCount,
      baseline.needsReviewPaymentCount + 1,
    );
    assert(
      dashboardDuringProduction.lowStockMaterials.some(
        (row) => row.id === material.id && row.availableGrams === '100.00',
      ),
    );

    const firstJob = jobs[0];
    const secondJob = jobs[1];
    assert(firstJob && secondJob);
    await startPrintJob(firstJob.id, { printerName: 'P1S-TEST' }, context);
    await assert.rejects(() =>
      startPrintJob(firstJob.id, { printerName: 'P1S-TEST' }, context),
    );
    const failed = await failPrintJob(
      firstJob.id,
      { remark: '翘边，重新排产' },
      context,
    );
    assert.equal(failed.status, 'queued');
    assert.equal(failed.failedCount, 1);
    assert.equal(failed.deductions[0]?.requiredGrams, '20.00');
    assert.equal(failed.warning, false);
    assert.equal(
      (
        await db
          .select({ stockGrams: materials.stockGrams })
          .from(materials)
          .where(eq(materials.id, material.id))
      )[0]?.stockGrams,
      '80.00',
    );
    assert.equal(
      (
        await db
          .select()
          .from(materialStockMovements)
          .where(eq(materialStockMovements.refId, firstJob.id))
      ).filter((row) => row.movementType === 'reprint_loss').length,
      1,
    );

    await Promise.all([
      startPrintJob(firstJob.id, { printerName: 'P1S-TEST' }, context).then(
        () => postProcessPrintJob(firstJob.id, context),
      ),
      startPrintJob(secondJob.id, { printerName: 'A1-TEST' }, context).then(
        () => postProcessPrintJob(secondJob.id, context),
      ),
    ]);
    await Promise.all([
      completePrintJob(firstJob.id, context),
      completePrintJob(secondJob.id, context),
    ]);
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, order.id))
      )[0]?.status,
      'pending_shipment',
    );
    const dashboardAfterCompletion = await getAdminDashboard();
    assert.equal(
      dashboardAfterCompletion.pendingShipmentCount,
      baseline.pendingShipmentCount + 1,
    );
  } finally {
    if (orderId) {
      const jobIds = (
        await db
          .select({ id: printJobs.id })
          .from(printJobs)
          .where(eq(printJobs.orderId, orderId))
      ).map((row) => row.id);
      await db
        .delete(adminOperationLogs)
        .where(inArray(adminOperationLogs.targetId, jobIds));
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.refId, jobIds));
      await db.delete(payments).where(eq(payments.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    if (adminId) await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    if (roleId) await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Production/dashboard functional test passed: filtering, transitions, reprint deduction, concurrent completion, metrics, review count, and low-stock alerts.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Production/dashboard test failed: ${message}\n`);
  process.exitCode = 1;
});
