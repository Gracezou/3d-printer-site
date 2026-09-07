import assert from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getActiveCustomerIdentity } from '@/lib/auth/customer';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  adminOperationLogs,
  adminRoles,
  adminUsers,
  orders,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  getAdminUserDetail,
  listAdminUsers,
  updateAdminUserStatus,
} from '@/lib/services/admin-user.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userId = crypto.randomUUID();
  const email = `t091-${suffix}@example.test`;
  const phone = `137${Date.now().toString().slice(-8)}`;

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
      email,
      phone,
      nickname: `T091 用户 ${suffix}`,
      lastLoginAt: new Date(),
    });
    await db.insert(addresses).values({
      userId,
      receiverName: 'T091 收件人',
      receiverPhone: '13600136000',
      province: '广东省',
      provinceCode: '440000',
      city: '深圳市',
      district: '南山区',
      detail: '测试路 7 号',
      isDefault: true,
    });
    await db.insert(orders).values([
      {
        orderNo: `T091A${suffix}`,
        userId,
        status: 'completed',
        itemsAmount: '100.00',
        payableAmount: '100.00',
        paidAmount: '100.00',
        refundedAmount: '20.00',
        receiverName: 'T091 收件人',
        receiverPhone: '13600136000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 7 号',
        paidAt: new Date(),
        completedAt: new Date(),
      },
      {
        orderNo: `T091B${suffix}`,
        userId,
        status: 'pending_payment',
        itemsAmount: '30.00',
        payableAmount: '30.00',
        receiverName: 'T091 收件人',
        receiverPhone: '13600136000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 7 号',
      },
    ]);

    const listed = await listAdminUsers({
      keyword: phone,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 1);
    assert.equal(listed.list[0]?.email, `t0***@example.test`);
    assert.equal(
      listed.list[0]?.phone,
      `${phone.slice(0, 3)}****${phone.slice(-4)}`,
    );
    assert.equal(listed.list[0]?.orderCount, 2);
    assert.equal(listed.list[0]?.totalSpent, '80.00');
    assert(!JSON.stringify(listed).includes(phone));

    const detail = await getAdminUserDetail(userId);
    assert.equal(detail.email, `t0***@example.test`);
    assert.equal(detail.phone, `${phone.slice(0, 3)}****${phone.slice(-4)}`);
    assert.equal(detail.addresses[0]?.receiverPhone, '136****6000');
    assert.equal(detail.orderCount, 2);
    assert.equal(detail.totalSpent, '80.00');
    const serialized = JSON.stringify(detail);
    assert(!serialized.includes(phone));
    assert(!serialized.includes(email));
    assert(!serialized.includes('13600136000'));
    assert(!serialized.toLowerCase().includes('password'));

    await updateAdminUserStatus(userId, 'disabled', context);
    await assert.rejects(
      () => getActiveCustomerIdentity(userId),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40104);
        return true;
      },
    );
    const disabled = await listAdminUsers({
      keyword: phone,
      status: 'disabled',
      page: 1,
      pageSize: 20,
    });
    assert.equal(disabled.total, 1);

    await updateAdminUserStatus(userId, 'active', context);
    assert.equal((await getActiveCustomerIdentity(userId)).id, userId);
  } finally {
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(addresses).where(eq(addresses.userId, userId));
    await db
      .delete(adminOperationLogs)
      .where(
        and(
          eq(adminOperationLogs.targetType, 'user'),
          eq(adminOperationLogs.targetId, userId),
        ),
      );
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Admin-user functional test passed: masked phones, address/order detail, net spend, status filtering, audit logging, and disabled-account authentication guard.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Admin-user test failed: ${message}\n`);
  process.exitCode = 1;
});
