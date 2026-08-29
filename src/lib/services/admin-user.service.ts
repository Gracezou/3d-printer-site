import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import Decimal from 'decimal.js';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import { addresses, orders, userProfiles } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { maskPhone } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import { withAdminLog } from '@/lib/services/admin-log.service';
import type { AdminUserListQuery } from '@/lib/validators/admin-user';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function userFilters(query: AdminUserListQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.keyword) {
    const keyword = `%${query.keyword}%`;
    filters.push(
      or(
        ilike(userProfiles.phone, keyword),
        ilike(userProfiles.nickname, keyword),
      )!,
    );
  }
  if (query.status) filters.push(eq(userProfiles.status, query.status));
  return filters;
}

export async function listAdminUsers(query: AdminUserListQuery) {
  const db = getDb();
  const filters = userFilters(query);
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: userProfiles.id,
        phone: userProfiles.phone,
        nickname: userProfiles.nickname,
        avatarUrl: userProfiles.avatarUrl,
        status: userProfiles.status,
        lastLoginAt: userProfiles.lastLoginAt,
        createdAt: userProfiles.createdAt,
        orderCount: sql<number>`count(${orders.id})::int`.as('order_count'),
        totalSpent:
          sql<string>`COALESCE(SUM(GREATEST(${orders.paidAmount} - ${orders.refundedAmount}, 0)), 0)::numeric(12, 2)`.as(
            'total_spent',
          ),
      })
      .from(userProfiles)
      .leftJoin(orders, eq(orders.userId, userProfiles.id))
      .where(where)
      .groupBy(userProfiles.id)
      .orderBy(desc(userProfiles.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(userProfiles).where(where),
  ]);
  return {
    list: rows.map((row) => ({ ...row, phone: maskPhone(row.phone) })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminUserDetail(userId: string) {
  const db = getDb();
  const [profile] = await db
    .select({
      id: userProfiles.id,
      phone: userProfiles.phone,
      nickname: userProfiles.nickname,
      avatarUrl: userProfiles.avatarUrl,
      status: userProfiles.status,
      lastLoginAt: userProfiles.lastLoginAt,
      createdAt: userProfiles.createdAt,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);
  if (!profile) throw new BizError('NOT_FOUND', '用户不存在');

  const [addressRows, orderRows] = await Promise.all([
    db
      .select({
        id: addresses.id,
        receiverName: addresses.receiverName,
        receiverPhone: addresses.receiverPhone,
        province: addresses.province,
        city: addresses.city,
        district: addresses.district,
        detail: addresses.detail,
        postalCode: addresses.postalCode,
        isDefault: addresses.isDefault,
        createdAt: addresses.createdAt,
      })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt)),
    db
      .select({
        orderNo: orders.orderNo,
        status: orders.status,
        payableAmount: orders.payableAmount,
        paidAmount: orders.paidAmount,
        refundedAmount: orders.refundedAmount,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt)),
  ]);
  const totalSpent = toFixed2(
    orderRows.reduce(
      (total, order) =>
        total.add(
          Decimal.max(
            new Decimal(order.paidAmount).minus(order.refundedAmount),
            0,
          ),
        ),
      new Decimal(0),
    ),
  );

  return {
    ...profile,
    phone: maskPhone(profile.phone),
    orderCount: orderRows.length,
    totalSpent,
    addresses: addressRows.map((address) => ({
      ...address,
      receiverPhone: maskPhone(address.receiverPhone),
    })),
    orders: orderRows,
  };
}

export async function updateAdminUserStatus(
  userId: string,
  status: 'active' | 'disabled',
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(userProfiles)
        .set({ status, updatedAt: new Date() })
        .where(eq(userProfiles.id, userId))
        .returning({
          id: userProfiles.id,
          phone: userProfiles.phone,
          status: userProfiles.status,
        });
      if (!updated) throw new BizError('NOT_FOUND', '用户不存在');
      return { ...updated, phone: maskPhone(updated.phone) };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'user.status',
      targetType: 'user',
      targetId: userId,
      payload: { status },
      ip: context.ip,
    },
  );
}
