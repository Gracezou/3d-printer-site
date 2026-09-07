import { and, count, desc, eq, ilike, type SQL, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  discountCodes,
  discountRedemptions,
  orders,
  promotions,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { maskEmail } from '@/lib/logger';
import { withAdminLog } from '@/lib/services/admin-log.service';
import {
  createDiscountCodeSchema,
  type CreateDiscountCodeInput,
  type DiscountCodeListQuery,
  type RedemptionListQuery,
  type UpdateDiscountCodeInput,
} from '@/lib/validators/discount-code';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

const statusExpression = sql<string>`CASE
  WHEN ${discountCodes.isActive} = false THEN 'disabled'
  WHEN ${discountCodes.startsAt} > now() THEN 'not_started'
  WHEN ${discountCodes.endsAt} IS NOT NULL AND ${discountCodes.endsAt} <= now() THEN 'expired'
  WHEN ${discountCodes.maxUses} IS NOT NULL AND ${discountCodes.usedCount} >= ${discountCodes.maxUses} THEN 'exhausted'
  ELSE 'active'
END`;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function throwCodeConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new BizError('PARAM_INVALID', '折扣码已存在');
  }
  throw error;
}

export async function listDiscountCodes(query: DiscountCodeListQuery) {
  const filters: SQL[] = [];
  if (query.keyword)
    filters.push(ilike(discountCodes.code, `%${query.keyword}%`));
  if (query.promotionId)
    filters.push(eq(discountCodes.promotionId, query.promotionId));
  if (query.codeType) filters.push(eq(discountCodes.codeType, query.codeType));
  if (query.status) filters.push(sql`${statusExpression} = ${query.status}`);
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const db = getDb();
  const [list, totals, promotionOptions] = await Promise.all([
    db
      .select({
        id: discountCodes.id,
        promotionId: discountCodes.promotionId,
        promotionName: promotions.name,
        promotionActive: promotions.isActive,
        code: discountCodes.code,
        codeType: discountCodes.codeType,
        maxUses: discountCodes.maxUses,
        usedCount: discountCodes.usedCount,
        perUserLimit: discountCodes.perUserLimit,
        startsAt: discountCodes.startsAt,
        endsAt: discountCodes.endsAt,
        isActive: discountCodes.isActive,
        remark: discountCodes.remark,
        status: statusExpression.as('status'),
        redemptionCount:
          sql<number>`(SELECT count(*)::int FROM ${discountRedemptions} dr WHERE dr.code_id = ${discountCodes.id})`.as(
            'redemption_count',
          ),
        createdAt: discountCodes.createdAt,
        updatedAt: discountCodes.updatedAt,
      })
      .from(discountCodes)
      .innerJoin(promotions, eq(promotions.id, discountCodes.promotionId))
      .where(where)
      .orderBy(desc(discountCodes.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(discountCodes).where(where),
    db
      .select({
        id: promotions.id,
        name: promotions.name,
        isActive: promotions.isActive,
      })
      .from(promotions)
      .orderBy(promotions.name),
  ]);
  return {
    list,
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    promotionOptions,
  };
}

export async function getDiscountCode(codeId: string) {
  const [record] = await getDb()
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.id, codeId))
    .limit(1);
  if (!record) throw new BizError('NOT_FOUND', '折扣码不存在');
  return record;
}

export async function createDiscountCode(
  input: CreateDiscountCodeInput,
  context: WriteContext,
) {
  const validated = createDiscountCodeSchema.parse(input);
  try {
    return await withAdminLog(
      async (tx) => {
        const [promotion] = await tx
          .select({ id: promotions.id })
          .from(promotions)
          .where(eq(promotions.id, validated.promotionId))
          .limit(1);
        if (!promotion) throw new BizError('NOT_FOUND', '优惠规则不存在');
        const [created] = await tx
          .insert(discountCodes)
          .values(validated)
          .returning();
        if (!created) throw new BizError('INTERNAL_ERROR', '创建折扣码失败');
        return created;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'discount_code.create',
        targetType: 'discount_code',
        targetId: (record) => record.id,
        payload: { code: validated.code, codeType: validated.codeType },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwCodeConflict(error);
  }
}

export async function updateDiscountCode(
  codeId: string,
  input: UpdateDiscountCodeInput,
  context: WriteContext,
) {
  const current = await getDiscountCode(codeId);
  const merged = createDiscountCodeSchema.parse({
    promotionId: input.promotionId ?? current.promotionId,
    code: input.code ?? current.code,
    codeType: input.codeType ?? current.codeType,
    maxUses: input.maxUses === undefined ? current.maxUses : input.maxUses,
    perUserLimit: input.perUserLimit ?? current.perUserLimit,
    startsAt: input.startsAt ?? current.startsAt,
    endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt,
    isActive: input.isActive ?? current.isActive,
    remark: input.remark === undefined ? current.remark : input.remark,
  });
  if (merged.maxUses !== null && merged.maxUses < current.usedCount) {
    throw new BizError('PARAM_INVALID', '总次数不能小于当前已用次数');
  }
  try {
    return await withAdminLog(
      async (tx) => {
        const [promotion] = await tx
          .select({ id: promotions.id })
          .from(promotions)
          .where(eq(promotions.id, merged.promotionId))
          .limit(1);
        if (!promotion) throw new BizError('NOT_FOUND', '优惠规则不存在');
        const [updated] = await tx
          .update(discountCodes)
          .set({ ...merged, updatedAt: new Date() })
          .where(eq(discountCodes.id, codeId))
          .returning();
        if (!updated) throw new BizError('NOT_FOUND', '折扣码不存在');
        return updated;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'discount_code.update',
        targetType: 'discount_code',
        targetId: codeId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwCodeConflict(error);
  }
}

export async function toggleDiscountCode(
  codeId: string,
  isActive: boolean,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(discountCodes)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(discountCodes.id, codeId))
        .returning({ id: discountCodes.id, isActive: discountCodes.isActive });
      if (!updated) throw new BizError('NOT_FOUND', '折扣码不存在');
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'discount_code.toggle',
      targetType: 'discount_code',
      targetId: codeId,
      payload: { isActive },
      ip: context.ip,
    },
  );
}

export async function deleteDiscountCode(
  codeId: string,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [record] = await tx
        .select({ id: discountCodes.id, usedCount: discountCodes.usedCount })
        .from(discountCodes)
        .where(eq(discountCodes.id, codeId))
        .limit(1);
      if (!record) throw new BizError('NOT_FOUND', '折扣码不存在');
      const [usage] = await tx
        .select({ total: count() })
        .from(discountRedemptions)
        .where(eq(discountRedemptions.codeId, codeId));
      if (record.usedCount > 0 || (usage?.total ?? 0) > 0) {
        throw new BizError(
          'PARAM_INVALID',
          '该折扣码已有核销记录，请停用而不是删除',
        );
      }
      await tx.delete(discountCodes).where(eq(discountCodes.id, codeId));
      return { id: codeId, deleted: true as const };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'discount_code.delete',
      targetType: 'discount_code',
      targetId: codeId,
      ip: context.ip,
    },
  );
}

export async function listDiscountRedemptions(
  codeId: string,
  query: RedemptionListQuery,
) {
  await getDiscountCode(codeId);
  const db = getDb();
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: discountRedemptions.id,
        orderNo: orders.orderNo,
        userEmail: userProfiles.email,
        discountAmount: discountRedemptions.discountAmount,
        status: discountRedemptions.status,
        createdAt: discountRedemptions.createdAt,
        releasedAt: discountRedemptions.releasedAt,
      })
      .from(discountRedemptions)
      .innerJoin(orders, eq(orders.id, discountRedemptions.orderId))
      .innerJoin(userProfiles, eq(userProfiles.id, discountRedemptions.userId))
      .where(eq(discountRedemptions.codeId, codeId))
      .orderBy(desc(discountRedemptions.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.codeId, codeId)),
  ]);
  return {
    list: rows.map((row) => ({
      ...row,
      userEmail: maskEmail(row.userEmail),
    })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}
