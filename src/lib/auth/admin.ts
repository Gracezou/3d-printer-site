import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import {
  ADMIN_SESSION_SECONDS,
  ADMIN_COOKIE_NAME,
  type AdminTokenClaims,
  signAdminToken,
  verifyAdminToken,
} from '@/lib/auth/admin-token';
import { assertPermission, type Permission } from '@/lib/auth/permissions';
import { getDb } from '@/lib/db/client';
import { adminRoles, adminUsers } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';

export interface AdminIdentity extends AdminTokenClaims {
  username: string;
}

export async function setAdminSession(claims: AdminTokenClaims): Promise<void> {
  const token = await signAdminToken(claims);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) {
    throw new BizError('UNAUTHORIZED', '后台登录已失效');
  }

  let claims: AdminTokenClaims;
  try {
    claims = await verifyAdminToken(token);
  } catch {
    throw new BizError('UNAUTHORIZED', '后台登录已失效');
  }

  const [admin] = await getDb()
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      name: adminUsers.name,
      status: adminUsers.status,
      roleCode: adminRoles.code,
      permissions: adminRoles.permissions,
    })
    .from(adminUsers)
    .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
    .where(and(eq(adminUsers.id, claims.sub), eq(adminUsers.status, 'active')))
    .limit(1);

  if (!admin) {
    throw new BizError('UNAUTHORIZED', '后台账号不存在或已被停用');
  }

  return {
    sub: admin.id,
    username: admin.username,
    name: admin.name,
    roleCode: admin.roleCode,
    permissions: admin.permissions,
  };
}

export async function requirePermission(
  permission: Permission,
): Promise<AdminIdentity> {
  const admin = await requireAdmin();
  assertPermission(admin.permissions, permission);
  return admin;
}
