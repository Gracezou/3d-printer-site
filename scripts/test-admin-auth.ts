import assert from 'node:assert/strict';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import { adminOperationLogs, adminRoles, adminUsers } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { authenticateAdmin } from '@/lib/services/admin-auth.service';
import { withAdminLog } from '@/lib/services/admin-log.service';

async function expectLoginError(
  username: string,
  password: string,
  expectedCode: number,
): Promise<void> {
  try {
    await authenticateAdmin(username, password);
    assert.fail('login should have failed');
  } catch (error: unknown) {
    assert(error instanceof BizError);
    assert.equal(error.code, expectedCode);
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const roleCode = `p2_role_${suffix}`;
  const username = `p2_admin_${suffix}`;
  const password = `P2-test-${suffix}`;
  let roleId: string | undefined;
  let adminId: string | undefined;

  try {
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: roleCode,
        name: 'P2 test role',
        permissions: ['order:view'],
      })
      .returning({ id: adminRoles.id });
    assert(role);
    roleId = role.id;

    const [admin] = await db
      .insert(adminUsers)
      .values({
        username,
        passwordHash: await bcrypt.hash(password, 12),
        name: 'P2 test admin',
        roleId,
      })
      .returning({ id: adminUsers.id });
    assert(admin);
    adminId = admin.id;
    const createdAdminId = admin.id;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectLoginError(username, 'wrong-password', 40105);
    }
    await expectLoginError(username, 'wrong-password', 40106);
    await expectLoginError(username, password, 40106);

    const [lockedAdmin] = await db
      .select({
        failedLoginCount: adminUsers.failedLoginCount,
        lockedUntil: adminUsers.lockedUntil,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, createdAdminId));
    assert.equal(lockedAdmin?.failedLoginCount, 5);
    assert(lockedAdmin?.lockedUntil && lockedAdmin.lockedUntil > new Date());

    await db
      .update(adminUsers)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(adminUsers.id, adminId));
    const claims = await authenticateAdmin(username, password);
    assert.equal(claims.sub, createdAdminId);
    assert.deepEqual(claims.permissions, ['order:view']);

    await withAdminLog(
      async (tx) => {
        await tx
          .update(adminUsers)
          .set({ name: 'P2 test admin updated' })
          .where(eq(adminUsers.id, createdAdminId));
      },
      {
        adminId: createdAdminId,
        adminName: 'P2 test admin',
        action: 'p2.test.write',
        targetType: 'admin_user',
        targetId: createdAdminId,
        ip: '127.0.0.1',
      },
    );
    const logs = await db
      .select({ id: adminOperationLogs.id })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.action, 'p2.test.write'));
    assert.equal(logs.length, 1);
  } finally {
    if (adminId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, adminId));
      await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    }
    if (roleId) {
      await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Admin authentication integration tests passed; test records removed.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Admin authentication integration tests failed: ${message}\n`,
  );
  process.exitCode = 1;
});
