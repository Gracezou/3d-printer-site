import { and, count, desc, eq, ilike, type SQL, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  discountCodes,
  discountRedemptions,
  promotions,
  userCoupons,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { withAdminLog } from '@/lib/services/admin-log.service';
import type {
  CreatePromotionInput,
  PromotionListQuery,
  UpdatePromotionInput,
} from '@/lib/validators/promotion';
import { createPromotionSchema } from '@/lib/validators/promotion';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function normalizeValues<T extends CreatePromotionInput | UpdatePromotionInput>(
  input: T,
): T {
  const normalized = { ...input };
  if (normalized.discountType === 'free_shipping') {
    normalized.discountValue = '0';
    normalized.maxDiscountAmount = null;
  } else if (normalized.discountType === 'fixed_amount') {
    normalized.maxDiscountAmount = null;
  }
  if (normalized.scope === 'all') normalized.scopeIds = [];
  return normalized;
}

export async function listPromotions(query: PromotionListQuery) {
  const filters: SQL[] = [];
  if (query.keyword) filters.push(ilike(promotions.name, `%${query.keyword}%`));
  if (query.discountType)
    filters.push(eq(promotions.discountType, query.discountType));
  if (query.isActive !== undefined)
    filters.push(eq(promotions.isActive, query.isActive));
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const db = getDb();
  const [list, totals] = await Promise.all([
    db
      .select({
        id: promotions.id,
        name: promotions.name,
        discountType: promotions.discountType,
        discountValue: promotions.discountValue,
        minOrderAmount: promotions.minOrderAmount,
        maxDiscountAmount: promotions.maxDiscountAmount,
        scope: promotions.scope,
        scopeIds: promotions.scopeIds,
        isActive: promotions.isActive,
        codeCount:
          sql<number>`(SELECT count(*)::int FROM ${discountCodes} dc WHERE dc.promotion_id = ${promotions.id})`.as(
            'code_count',
          ),
        createdAt: promotions.createdAt,
        updatedAt: promotions.updatedAt,
      })
      .from(promotions)
      .where(where)
      .orderBy(desc(promotions.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(promotions).where(where),
  ]);
  return {
    list,
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getPromotion(promotionId: string) {
  const [promotion] = await getDb()
    .select()
    .from(promotions)
    .where(eq(promotions.id, promotionId))
    .limit(1);
  if (!promotion) throw new BizError('NOT_FOUND', '优惠规则不存在');
  return promotion;
}

export async function createPromotion(
  input: CreatePromotionInput,
  context: WriteContext,
) {
  const values = normalizeValues(input);
  return withAdminLog(
    async (tx) => {
      const [created] = await tx.insert(promotions).values(values).returning();
      if (!created) throw new BizError('INTERNAL_ERROR', '创建优惠规则失败');
      return created;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'promotion.create',
      targetType: 'promotion',
      targetId: (record) => record.id,
      payload: {
        name: input.name,
        discountType: input.discountType,
        scope: input.scope,
      },
      ip: context.ip,
    },
  );
}

export async function updatePromotion(
  promotionId: string,
  input: UpdatePromotionInput,
  context: WriteContext,
) {
  const current = await getPromotion(promotionId);
  const merged = createPromotionSchema.parse(
    createPromotionInputFromRecord(current, input),
  );
  const validated = normalizeValues(merged);
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(promotions)
        .set({ ...validated, updatedAt: new Date() })
        .where(eq(promotions.id, promotionId))
        .returning();
      if (!updated) throw new BizError('NOT_FOUND', '优惠规则不存在');
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'promotion.update',
      targetType: 'promotion',
      targetId: promotionId,
      payload: { fields: Object.keys(input) },
      ip: context.ip,
    },
  );
}

function createPromotionInputFromRecord(
  current: Awaited<ReturnType<typeof getPromotion>>,
  input: UpdatePromotionInput,
): CreatePromotionInput {
  return {
    name: input.name ?? current.name,
    discountType: (input.discountType ??
      current.discountType) as CreatePromotionInput['discountType'],
    discountValue: input.discountValue ?? current.discountValue,
    minOrderAmount: input.minOrderAmount ?? current.minOrderAmount,
    maxDiscountAmount:
      input.maxDiscountAmount === undefined
        ? current.maxDiscountAmount
        : input.maxDiscountAmount,
    scope: (input.scope ?? current.scope) as CreatePromotionInput['scope'],
    scopeIds: input.scopeIds ?? current.scopeIds,
    isActive: input.isActive ?? current.isActive,
  };
}

export async function deletePromotion(
  promotionId: string,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [codeUsage] = await tx
        .select({ total: count() })
        .from(discountCodes)
        .where(eq(discountCodes.promotionId, promotionId));
      const [redemptionUsage] = await tx
        .select({ total: count() })
        .from(discountRedemptions)
        .where(eq(discountRedemptions.promotionId, promotionId));
      const [couponUsage] = await tx
        .select({ total: count() })
        .from(userCoupons)
        .where(eq(userCoupons.promotionId, promotionId));
      if (
        (codeUsage?.total ?? 0) > 0 ||
        (redemptionUsage?.total ?? 0) > 0 ||
        (couponUsage?.total ?? 0) > 0
      ) {
        throw new BizError(
          'PARAM_INVALID',
          '该规则已关联折扣码或核销数据，请停用而不是删除',
        );
      }
      const [deleted] = await tx
        .delete(promotions)
        .where(eq(promotions.id, promotionId))
        .returning({ id: promotions.id });
      if (!deleted) throw new BizError('NOT_FOUND', '优惠规则不存在');
      return { id: deleted.id, deleted: true as const };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'promotion.delete',
      targetType: 'promotion',
      targetId: promotionId,
      ip: context.ip,
    },
  );
}
