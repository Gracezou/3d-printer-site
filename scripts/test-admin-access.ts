import assert from 'node:assert/strict';

import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { assertPermission } from '@/lib/auth/permissions';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { adminOperationLogs, adminRoles, adminUsers } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createAdminAccount,
  createAdminRole,
  deleteAdminAccount,
  deleteAdminRole,
  listAdminAccounts,
  listAdminRoles,
  resetAdminAccountPassword,
  updateAdminAccount,
  updateAdminRole,
} from '@/lib/services/admin-access.service';

async function expectForbidden(
  operation: () => Promise<unknown>,
  message: string,
) {
  await assert.rejects(
    operation,
    (error: unknown) => {
      assert.ok(error instanceof BizError);
      assert.equal(error.code, 40301);
      return true;
    },
    message,
  );
}

async function main() {
  const db = getDb();
  const suffix = Date.now().toString(36);
  let actorRoleId = '';
  let actorId = '';
  let managedRoleId = '';
  let managedAdminId = '';

  try {
    const [actorRole] = await db
      .insert(adminRoles)
      .values({
        code: `test_owner_${suffix}`,
        name: '测试权限管理员',
        permissions: ['*'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    actorRoleId = actorRole!.id;
    const [actor] = await db
      .insert(adminUsers)
      .values({
        username: `owner_${suffix}`,
        passwordHash: await bcrypt.hash('OwnerPass123!', 12),
        name: '测试权限管理员',
        roleId: actorRoleId,
      })
      .returning({ id: adminUsers.id });
    actorId = actor!.id;

    const identity: AdminIdentity = {
      sub: actorId,
      username: `owner_${suffix}`,
      name: '测试权限管理员',
      roleCode: actorRole!.code,
      permissions: ['*'],
    };
    const context = { admin: identity, ip: '127.0.0.1' };

    const role = await createAdminRole(
      {
        code: `test_operator_${suffix}`,
        name: '测试运营',
        permissions: ['admin:view', 'order:view'],
      },
      context,
    );
    managedRoleId = role.id;
    const account = await createAdminAccount(
      {
        username: `operator_${suffix}`,
        password: 'InitialPass123!',
        name: '测试运营账号',
        roleId: managedRoleId,
        status: 'active',
      },
      context,
    );
    managedAdminId = account.id;

    const list = await listAdminAccounts({
      keyword: `operator_${suffix}`,
      page: 1,
      pageSize: 20,
    });
    assert.equal(list.total, 1);
    assert.equal(list.list[0]?.roleId, managedRoleId);
    assert.ok(
      !('passwordHash' in (list.list[0] ?? {})),
      '列表不得返回密码哈希',
    );

    const [stored] = await db
      .select({ passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(eq(adminUsers.id, managedAdminId));
    assert.ok(
      await bcrypt.compare('InitialPass123!', stored!.passwordHash),
      '初始密码必须使用 bcrypt 保存',
    );

    assert.throws(
      () => assertPermission(role.permissions, 'order:refund'),
      (error: unknown) =>
        error instanceof BizError &&
        error.code === 40301 &&
        error.httpStatus === 403,
      '无退款权限的运营账号必须收到 403',
    );

    await resetAdminAccountPassword(managedAdminId, 'ResetPass123!', context);
    const [reset] = await db
      .select({ passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(eq(adminUsers.id, managedAdminId));
    assert.ok(await bcrypt.compare('ResetPass123!', reset!.passwordHash));

    await expectForbidden(
      () => updateAdminAccount(actorId, { roleId: managedRoleId }, context),
      '不能把自己调整到缺少 admin:edit 的角色',
    );
    await expectForbidden(
      () =>
        updateAdminRole(actorRoleId, { permissions: ['admin:view'] }, context),
      '不能移除自己所属角色的 admin:edit 权限',
    );

    const systemRole = (await listAdminRoles()).find((item) => item.isSystem);
    assert.ok(systemRole, '应存在系统角色种子数据');
    await expectForbidden(
      () => deleteAdminRole(systemRole.id, context),
      '系统角色不可删除',
    );

    await updateAdminAccount(
      managedAdminId,
      { status: 'disabled', name: '已停用测试运营' },
      context,
    );
    await deleteAdminAccount(managedAdminId, context);
    managedAdminId = '';
    await deleteAdminRole(managedRoleId, context);
    managedRoleId = '';

    const [logs] = await db
      .select({ total: adminOperationLogs.id })
      .from(adminOperationLogs)
      .where(
        and(
          eq(adminOperationLogs.adminId, actorId),
          eq(adminOperationLogs.action, 'admin.password.reset'),
        ),
      )
      .limit(1);
    assert.ok(logs, '重置密码必须写入审计日志');

    process.stdout.write(
      'Admin-access functional test passed: CRUD, bcrypt password reset, permission isolation, self-protection, system-role protection, and audit logging.\n',
    );
  } finally {
    if (actorId)
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, actorId));
    if (managedAdminId)
      await db.delete(adminUsers).where(eq(adminUsers.id, managedAdminId));
    if (managedRoleId)
      await db.delete(adminRoles).where(eq(adminRoles.id, managedRoleId));
    if (actorId) await db.delete(adminUsers).where(eq(adminUsers.id, actorId));
    if (actorRoleId)
      await db.delete(adminRoles).where(eq(adminRoles.id, actorRoleId));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Admin-access test failed: ${message}\n`);
  process.exitCode = 1;
});
