import bcrypt from 'bcryptjs';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';
import { getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  printJobs,
  refunds,
  shipments,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  type DbTransaction,
  withAdminLog,
} from '@/lib/services/admin-log.service';
import type {
  AdminAccountListQuery,
  CreateAdminAccountInput,
  CreateAdminRoleInput,
  UpdateAdminAccountInput,
  UpdateAdminRoleInput,
} from '@/lib/validators/admin-access';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}

function uniquePermissions(permissions: string[]): string[] {
  return [...new Set(permissions)];
}

async function assertRoleExists(tx: DbTransaction, roleId: string) {
  const [role] = await tx
    .select({
      id: adminRoles.id,
      code: adminRoles.code,
      permissions: adminRoles.permissions,
    })
    .from(adminRoles)
    .where(eq(adminRoles.id, roleId))
    .limit(1);
  if (!role) throw new BizError('NOT_FOUND', '角色不存在');
  return role;
}

export async function listAdminAccounts(query: AdminAccountListQuery) {
  const filters: SQL[] = [];
  if (query.keyword) {
    const keyword = `%${query.keyword}%`;
    filters.push(
      or(ilike(adminUsers.username, keyword), ilike(adminUsers.name, keyword))!,
    );
  }
  if (query.status) filters.push(eq(adminUsers.status, query.status));
  const where = filters.length ? and(...filters) : undefined;
  const db = getDb();
  const [list, totals] = await Promise.all([
    db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        name: adminUsers.name,
        status: adminUsers.status,
        roleId: adminRoles.id,
        roleCode: adminRoles.code,
        roleName: adminRoles.name,
        lastLoginAt: adminUsers.lastLoginAt,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(where)
      .orderBy(desc(adminUsers.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(adminUsers).where(where),
  ]);
  return {
    list,
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminAccount(id: string) {
  const [record] = await getDb()
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      name: adminUsers.name,
      status: adminUsers.status,
      roleId: adminRoles.id,
      roleCode: adminRoles.code,
      roleName: adminRoles.name,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
      updatedAt: adminUsers.updatedAt,
    })
    .from(adminUsers)
    .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
    .where(eq(adminUsers.id, id))
    .limit(1);
  if (!record) throw new BizError('NOT_FOUND', '管理员不存在');
  return record;
}

export async function createAdminAccount(
  input: CreateAdminAccountInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        await assertRoleExists(tx, input.roleId);
        const [created] = await tx
          .insert(adminUsers)
          .values({
            username: input.username,
            passwordHash: await bcrypt.hash(input.password, 12),
            name: input.name,
            roleId: input.roleId,
            status: input.status,
          })
          .returning({
            id: adminUsers.id,
            username: adminUsers.username,
            name: adminUsers.name,
            roleId: adminUsers.roleId,
            status: adminUsers.status,
          });
        return created!;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'admin.create',
        targetType: 'admin_user',
        targetId: (result) => result.id,
        payload: (result) => ({
          username: result.username,
          roleId: result.roleId,
          status: result.status,
        }),
        ip: context.ip,
      },
    );
  } catch (error) {
    if (isUniqueViolation(error))
      throw new BizError('PARAM_INVALID', '管理员用户名已存在');
    throw error;
  }
}

export async function updateAdminAccount(
  id: string,
  input: UpdateAdminAccountInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [current] = await tx
          .select({ id: adminUsers.id, roleId: adminUsers.roleId })
          .from(adminUsers)
          .where(eq(adminUsers.id, id))
          .limit(1)
          .for('update');
        if (!current) throw new BizError('NOT_FOUND', '管理员不存在');
        if (id === context.admin.sub && input.status === 'disabled') {
          throw new BizError('FORBIDDEN', '不能停用自己的管理员账号');
        }
        if (input.roleId) {
          const role = await assertRoleExists(tx, input.roleId);
          if (
            id === context.admin.sub &&
            !hasPermission(role.permissions, 'admin:edit')
          ) {
            throw new BizError(
              'FORBIDDEN',
              '不能将自己调整为缺少 admin:edit 权限的角色',
            );
          }
        }
        const [updated] = await tx
          .update(adminUsers)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(adminUsers.id, id))
          .returning({
            id: adminUsers.id,
            username: adminUsers.username,
            name: adminUsers.name,
            roleId: adminUsers.roleId,
            status: adminUsers.status,
          });
        return updated!;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'admin.update',
        targetType: 'admin_user',
        targetId: id,
        payload: { ...input },
        ip: context.ip,
      },
    );
  } catch (error) {
    if (isUniqueViolation(error))
      throw new BizError('PARAM_INVALID', '管理员用户名已存在');
    throw error;
  }
}

export async function resetAdminAccountPassword(
  id: string,
  password: string,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(adminUsers)
        .set({
          passwordHash: await bcrypt.hash(password, 12),
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(adminUsers.id, id))
        .returning({ id: adminUsers.id });
      if (!updated) throw new BizError('NOT_FOUND', '管理员不存在');
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'admin.password.reset',
      targetType: 'admin_user',
      targetId: id,
      ip: context.ip,
    },
  );
}

export async function deleteAdminAccount(id: string, context: WriteContext) {
  if (id === context.admin.sub)
    throw new BizError('FORBIDDEN', '不能删除自己的管理员账号');
  return withAdminLog(
    async (tx) => {
      const [existing] = await tx
        .select({ id: adminUsers.id, username: adminUsers.username })
        .from(adminUsers)
        .where(eq(adminUsers.id, id))
        .limit(1)
        .for('update');
      if (!existing) throw new BizError('NOT_FOUND', '管理员不存在');
      await Promise.all([
        tx
          .update(adminOperationLogs)
          .set({ adminId: null })
          .where(eq(adminOperationLogs.adminId, id)),
        tx
          .update(refunds)
          .set({ operatorId: null })
          .where(eq(refunds.operatorId, id)),
        tx
          .update(printJobs)
          .set({ assignedTo: null })
          .where(eq(printJobs.assignedTo, id)),
        tx
          .update(shipments)
          .set({ operatorId: null })
          .where(eq(shipments.operatorId, id)),
      ]);
      const [deleted] = await tx
        .delete(adminUsers)
        .where(eq(adminUsers.id, id))
        .returning({ id: adminUsers.id, username: adminUsers.username });
      return deleted;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'admin.delete',
      targetType: 'admin_user',
      targetId: id,
      ip: context.ip,
    },
  );
}

export async function listAdminRoles() {
  return getDb()
    .select({
      id: adminRoles.id,
      code: adminRoles.code,
      name: adminRoles.name,
      permissions: adminRoles.permissions,
      isSystem: adminRoles.isSystem,
      adminCount: count(adminUsers.id),
      createdAt: adminRoles.createdAt,
      updatedAt: adminRoles.updatedAt,
    })
    .from(adminRoles)
    .leftJoin(adminUsers, eq(adminUsers.roleId, adminRoles.id))
    .groupBy(adminRoles.id)
    .orderBy(desc(adminRoles.isSystem), adminRoles.name);
}

export async function createAdminRole(
  input: CreateAdminRoleInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [created] = await tx
          .insert(adminRoles)
          .values({
            ...input,
            permissions: uniquePermissions(input.permissions),
            isSystem: false,
          })
          .returning();
        return created!;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'role.create',
        targetType: 'admin_role',
        targetId: (result) => result.id,
        payload: (result) => ({
          code: result.code,
          name: result.name,
          permissions: result.permissions,
        }),
        ip: context.ip,
      },
    );
  } catch (error) {
    if (isUniqueViolation(error))
      throw new BizError('PARAM_INVALID', '角色编码已存在');
    throw error;
  }
}

export async function updateAdminRole(
  id: string,
  input: UpdateAdminRoleInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [role] = await tx
        .select({
          id: adminRoles.id,
          code: adminRoles.code,
          permissions: adminRoles.permissions,
        })
        .from(adminRoles)
        .where(eq(adminRoles.id, id))
        .limit(1)
        .for('update');
      if (!role) throw new BizError('NOT_FOUND', '角色不存在');
      const permissions = input.permissions
        ? uniquePermissions(input.permissions)
        : undefined;
      if (
        role.code === 'super_admin' &&
        permissions &&
        !permissions.includes('*')
      ) {
        throw new BizError('FORBIDDEN', '超级管理员角色必须保留全部权限');
      }
      if (permissions && !hasPermission(permissions, 'admin:edit')) {
        const [self] = await tx
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(
            and(
              eq(adminUsers.id, context.admin.sub),
              eq(adminUsers.roleId, id),
            ),
          )
          .limit(1);
        if (self)
          throw new BizError(
            'FORBIDDEN',
            '不能移除自己所属角色的 admin:edit 权限',
          );
      }
      const [updated] = await tx
        .update(adminRoles)
        .set({
          ...input,
          ...(permissions ? { permissions } : {}),
          updatedAt: new Date(),
        })
        .where(eq(adminRoles.id, id))
        .returning();
      return updated!;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'role.update',
      targetType: 'admin_role',
      targetId: id,
      payload: { ...input },
      ip: context.ip,
    },
  );
}

export async function deleteAdminRole(id: string, context: WriteContext) {
  return withAdminLog(
    async (tx) => {
      const [role] = await tx
        .select({
          id: adminRoles.id,
          code: adminRoles.code,
          isSystem: adminRoles.isSystem,
        })
        .from(adminRoles)
        .where(eq(adminRoles.id, id))
        .limit(1)
        .for('update');
      if (!role) throw new BizError('NOT_FOUND', '角色不存在');
      if (role.isSystem) throw new BizError('FORBIDDEN', '系统角色不可删除');
      const [usage] = await tx
        .select({ total: count() })
        .from(adminUsers)
        .where(eq(adminUsers.roleId, id));
      if ((usage?.total ?? 0) > 0)
        throw new BizError('PARAM_INVALID', '角色仍有关联管理员，无法删除');
      await tx.delete(adminRoles).where(eq(adminRoles.id, id));
      return role;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'role.delete',
      targetType: 'admin_role',
      targetId: id,
      ip: context.ip,
    },
  );
}
