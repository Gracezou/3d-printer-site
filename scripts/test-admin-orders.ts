import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  orders,
  shipments,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  cancelAdminOrder,
  exportAdminOrders,
  getAdminOrderDetail,
  listAdminOrders,
  shipAdminOrder,
  updateAdminOrderRemark,
} from '@/lib/services/admin-order.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const orderIds: string[] = [];

  try {
    const [adminRow] = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        name: adminUsers.name,
        roleCode: adminRoles.code,
        permissions: adminRoles.permissions,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(
        and(
          eq(adminRoles.code, 'super_admin'),
          eq(adminUsers.status, 'active'),
        ),
      )
      .limit(1);
    assert(adminRow, '需要已有的可用超级管理员账号');
    const admin: AdminIdentity = {
      sub: adminRow.id,
      username: adminRow.username,
      name: adminRow.name,
      roleCode: adminRow.roleCode,
      permissions: adminRow.permissions,
    };
    const context = { admin, ip: '127.0.0.1' };

    await db.insert(userProfiles).values({
      id: userId,
      phone: `132${suffix.slice(0, 8)}`,
      nickname: 'T070 测试用户',
    });
    const inserted = await db
      .insert(orders)
      .values([
        {
          orderNo: `T070P${suffix}`,
          userId,
          status: 'pending_payment',
          itemsAmount: '100.00',
          payableAmount: '100.00',
          receiverName: '=T070 CSV 防护',
          receiverPhone: '13800138000',
          receiverProvince: '广东省',
          receiverCity: '深圳市',
          receiverDistrict: '南山区',
          receiverDetail: '测试路 1 号',
        },
        {
          orderNo: `T070S${suffix}`,
          userId,
          status: 'pending_shipment',
          itemsAmount: '88.00',
          payableAmount: '88.00',
          paidAmount: '88.00',
          receiverName: 'T070 发货测试',
          receiverPhone: '13800138000',
          receiverProvince: '广东省',
          receiverCity: '深圳市',
          receiverDistrict: '南山区',
          receiverDetail: '测试路 2 号',
        },
      ])
      .returning({ id: orders.id, orderNo: orders.orderNo });
    orderIds.push(...inserted.map((order) => order.id));
    const pendingOrder = inserted[0];
    const shippingOrder = inserted[1];
    assert(pendingOrder && shippingOrder);

    const listed = await listAdminOrders({
      keyword: suffix,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 2);
    assert.equal(
      (await getAdminOrderDetail(pendingOrder.id)).orderNo,
      pendingOrder.orderNo,
    );

    await updateAdminOrderRemark(pendingOrder.id, 'T070 内部备注', context);
    assert.equal(
      (await getAdminOrderDetail(pendingOrder.id)).adminRemark,
      'T070 内部备注',
    );

    await assert.rejects(
      () =>
        shipAdminOrder(
          pendingOrder.id,
          { carrierCode: 'sf', carrierName: '顺丰速运', trackingNo: 'INVALID' },
          context,
        ),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40903);
        return true;
      },
    );

    await shipAdminOrder(
      shippingOrder.id,
      { carrierCode: 'sf', carrierName: '顺丰速运', trackingNo: `SF${suffix}` },
      context,
    );
    assert.equal(
      (await getAdminOrderDetail(shippingOrder.id)).status,
      'shipped',
    );
    assert.equal(
      (
        await db
          .select()
          .from(shipments)
          .where(eq(shipments.orderId, shippingOrder.id))
      ).length,
      1,
    );

    await cancelAdminOrder(pendingOrder.id, context);
    const cancelled = await getAdminOrderDetail(pendingOrder.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelReason, 'admin_cancel');

    const csv = await exportAdminOrders({
      keyword: suffix,
      page: 1,
      pageSize: 20,
    });
    assert(csv.startsWith('\uFEFF'));
    assert(csv.includes("'=T070 CSV 防护"), 'CSV 公式注入字符应被转义');
  } finally {
    if (orderIds.length) {
      await db
        .delete(adminOperationLogs)
        .where(
          and(
            eq(adminOperationLogs.targetType, 'order'),
            inArray(adminOperationLogs.targetId, orderIds),
          ),
        );
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Admin order functional test passed: list, detail, remark, 40903 guard, ship, cancel rollback path, and CSV.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Admin order functional test failed: ${message}\n`);
  process.exitCode = 1;
});
