import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import type { AdminTokenClaims } from '@/lib/auth/admin-token';
import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import { adminRoles, adminUsers } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { withAdminLog } from '@/lib/services/admin-log.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

type LoginOutcome =
  | { status: 'success'; claims: AdminTokenClaims }
  | { status: 'failed' }
  | { status: 'locked' };

export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<AdminTokenClaims> {
  const outcome = await getDb().transaction<LoginOutcome>(async (tx) => {
    const [admin] = await tx
      .select({
        id: adminUsers.id,
        passwordHash: adminUsers.passwordHash,
        name: adminUsers.name,
        status: adminUsers.status,
        failedLoginCount: adminUsers.failedLoginCount,
        lockedUntil: adminUsers.lockedUntil,
        roleCode: adminRoles.code,
        permissions: adminRoles.permissions,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(eq(adminUsers.username, username))
      .limit(1)
      .for('update');

    if (!admin || admin.status !== 'active') {
      return { status: 'failed' };
    }

    const now = new Date();
    if (admin.lockedUntil && admin.lockedUntil > now) {
      return { status: 'locked' };
    }

    const passwordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordValid) {
      const failedLoginCount = admin.failedLoginCount + 1;
      const lockedUntil =
        failedLoginCount >= MAX_FAILED_LOGINS
          ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
          : null;
      await tx
        .update(adminUsers)
        .set({ failedLoginCount, lockedUntil })
        .where(eq(adminUsers.id, admin.id));
      return lockedUntil ? { status: 'locked' } : { status: 'failed' };
    }

    await tx
      .update(adminUsers)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(adminUsers.id, admin.id));

    return {
      status: 'success',
      claims: {
        sub: admin.id,
        name: admin.name,
        roleCode: admin.roleCode,
        permissions: admin.permissions,
      },
    };
  });

  if (outcome.status === 'locked') {
    throw new BizError('ADMIN_LOCKED', '账号已锁定，请 15 分钟后再试');
  }
  if (outcome.status === 'failed') {
    throw new BizError('ADMIN_LOGIN_FAILED', '用户名或密码错误');
  }
  return outcome.claims;
}

export async function changeAdminPassword(
  admin: AdminIdentity,
  currentPassword: string,
  newPassword: string,
  ip: string,
): Promise<void> {
  await withAdminLog(
    async (tx) => {
      const [record] = await tx
        .select({ passwordHash: adminUsers.passwordHash })
        .from(adminUsers)
        .where(
          and(eq(adminUsers.id, admin.sub), eq(adminUsers.status, 'active')),
        )
        .limit(1)
        .for('update');

      if (
        !record ||
        !(await bcrypt.compare(currentPassword, record.passwordHash))
      ) {
        throw new BizError('ADMIN_LOGIN_FAILED', '当前密码错误');
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await tx
        .update(adminUsers)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null })
        .where(eq(adminUsers.id, admin.sub));
    },
    {
      adminId: admin.sub,
      adminName: admin.name,
      action: 'admin.password.change',
      targetType: 'admin_user',
      targetId: admin.sub,
      ip,
    },
  );
}
