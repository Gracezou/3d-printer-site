import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { signAdminToken, verifyAdminToken } from '@/lib/auth/admin-token';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { adminOperationLogs, adminRoles, adminUsers } from '@/lib/db/schema';
import { authenticateAdmin } from '@/lib/services/admin-auth.service';
import { withAdminLog } from '@/lib/services/admin-log.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `super_test_${suffix}`;
  const password = randomBytes(18).toString('base64url');
  let testAdminId: string | undefined;

  try {
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: 'super_admin',
        name: '超级管理员',
        permissions: ['*'],
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: adminRoles.code,
        set: { name: '超级管理员', permissions: ['*'], isSystem: true },
      })
      .returning({
        id: adminRoles.id,
        code: adminRoles.code,
        permissions: adminRoles.permissions,
        isSystem: adminRoles.isSystem,
      });
    assert(role);
    assert.equal(role.code, 'super_admin');
    assert.deepEqual(role.permissions, ['*']);
    assert.equal(role.isSystem, true);

    const [admin] = await db
      .insert(adminUsers)
      .values({
        username,
        passwordHash: await bcrypt.hash(password, 12),
        name: '超级管理员功能测试',
        roleId: role.id,
      })
      .returning({ id: adminUsers.id });
    assert(admin);
    testAdminId = admin.id;
    const createdAdminId = admin.id;

    const claims = await authenticateAdmin(username, password);
    assert.equal(claims.sub, createdAdminId);
    assert.equal(claims.roleCode, 'super_admin');
    assert.deepEqual(claims.permissions, ['*']);
    assert(
      PERMISSIONS.every((permission) =>
        hasPermission(claims.permissions, permission),
      ),
    );

    const token = await signAdminToken(claims);
    const verifiedClaims = await verifyAdminToken(token);
    assert.deepEqual(verifiedClaims, claims);

    await withAdminLog(
      async (tx) => {
        await tx
          .update(adminUsers)
          .set({ name: '超级管理员功能测试已通过' })
          .where(eq(adminUsers.id, createdAdminId));
      },
      {
        adminId: createdAdminId,
        adminName: claims.name,
        action: 'super_admin.functional_test',
        targetType: 'admin_user',
        targetId: createdAdminId,
        payload: { permissionsChecked: PERMISSIONS.length },
        ip: '127.0.0.1',
      },
    );

    const logs = await db
      .select({ payload: adminOperationLogs.payload })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.action, 'super_admin.functional_test'));
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.payload?.permissionsChecked, PERMISSIONS.length);
  } finally {
    if (testAdminId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, testAdminId));
      await db.delete(adminUsers).where(eq(adminUsers.id, testAdminId));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    `Super-admin role functional test passed: wildcard authorized all ${PERMISSIONS.length} permissions; temporary account and log removed.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Super-admin role functional test failed: ${message}\n`);
  process.exitCode = 1;
});
