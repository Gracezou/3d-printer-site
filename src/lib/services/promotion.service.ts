import Decimal from 'decimal.js';
import { and, count, eq, gt, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import {
  discountCodes,
  discountRedemptions,
  promotions,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { percent, toFixed2, type DecimalValue } from '@/lib/money';
import type { DbTransaction } from '@/lib/services/admin-log.service';

export type DiscountType = 'fixed_amount' | 'percentage' | 'free_shipping';

export interface DiscountResult {
  codeId: string;
  promotionId: string;
  code: string;
  name: string;
  type: DiscountType;
  discountAmount: string;
  freeShipping: boolean;
}

export interface OrderAmounts {
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  payableAmount: string;
}

interface CodeRow {
  codeId: string;
  promotionId: string;
  code: string;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  promotionName: string;
  promotionActive: boolean;
  discountType: string;
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string | null;
  scope: string;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

async function findCode(code: string, tx?: DbTransaction): Promise<CodeRow> {
  const executor = tx ?? getDb();
  const [row] = await executor
    .select({
      codeId: discountCodes.id,
      promotionId: promotions.id,
      code: discountCodes.code,
      isActive: discountCodes.isActive,
      startsAt: discountCodes.startsAt,
      endsAt: discountCodes.endsAt,
      maxUses: discountCodes.maxUses,
      usedCount: discountCodes.usedCount,
      perUserLimit: discountCodes.perUserLimit,
      promotionName: promotions.name,
      promotionActive: promotions.isActive,
      discountType: promotions.discountType,
      discountValue: promotions.discountValue,
      minOrderAmount: promotions.minOrderAmount,
      maxDiscountAmount: promotions.maxDiscountAmount,
      scope: promotions.scope,
    })
    .from(discountCodes)
    .innerJoin(promotions, eq(promotions.id, discountCodes.promotionId))
    .where(eq(discountCodes.code, normalizeCode(code)))
    .limit(1);
  if (!row) throw new BizError('CODE_NOT_FOUND', '折扣码不存在');
  return row;
}

function assertCodeAvailable(row: CodeRow, now: Date): void {
  if (
    !row.isActive ||
    !row.promotionActive ||
    row.startsAt > now ||
    (row.endsAt !== null && row.endsAt <= now)
  ) {
    throw new BizError('CODE_EXPIRED', '折扣码未生效或已过期');
  }
  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    throw new BizError('CODE_EXHAUSTED', '折扣码使用次数已用完');
  }
  if (row.scope !== 'all') {
    throw new BizError('CODE_NOT_FOUND', '折扣码不适用于当前商品');
  }
}

async function assertUserLimit(
  tx: DbTransaction | undefined,
  row: CodeRow,
  userId: string,
): Promise<void> {
  const executor = tx ?? getDb();
  const [usage] = await executor
    .select({ total: count() })
    .from(discountRedemptions)
    .where(
      and(
        eq(discountRedemptions.codeId, row.codeId),
        eq(discountRedemptions.userId, userId),
        or(
          eq(discountRedemptions.status, 'occupied'),
          eq(discountRedemptions.status, 'confirmed'),
        ),
      ),
    );
  if ((usage?.total ?? 0) >= row.perUserLimit) {
    throw new BizError('CODE_USER_LIMIT', '您已达到该折扣码的使用上限');
  }
}

function calculateDiscount(
  row: CodeRow,
  itemsAmount: DecimalValue,
): DiscountResult {
  const subtotal = new Decimal(itemsAmount);
  if (subtotal.lessThan(row.minOrderAmount)) {
    throw new BizError(
      'CODE_MIN_AMOUNT',
      `商品小计需满 ${toFixed2(row.minOrderAmount)} 元`,
    );
  }

  let amount = new Decimal(0);
  if (row.discountType === 'fixed_amount') {
    amount = new Decimal(row.discountValue);
  } else if (row.discountType === 'percentage') {
    const rate = new Decimal(1).minus(row.discountValue);
    amount = percent(subtotal, Decimal.max(rate, 0));
    if (row.maxDiscountAmount !== null) {
      amount = Decimal.min(amount, row.maxDiscountAmount);
    }
  } else if (row.discountType !== 'free_shipping') {
    throw new BizError('INTERNAL_ERROR', '折扣类型配置错误');
  }
  amount = Decimal.max(0, Decimal.min(amount, subtotal));
  return {
    codeId: row.codeId,
    promotionId: row.promotionId,
    code: row.code,
    name: row.promotionName,
    type: row.discountType as DiscountType,
    discountAmount: toFixed2(amount),
    freeShipping: row.discountType === 'free_shipping',
  };
}

export async function previewDiscountCode(
  code: string,
  userId: string,
  itemsAmount: DecimalValue,
): Promise<DiscountResult> {
  const row = await findCode(code);
  assertCodeAvailable(row, new Date());
  await assertUserLimit(undefined, row, userId);
  return calculateDiscount(row, itemsAmount);
}

export async function applyDiscountCode(
  tx: DbTransaction,
  code: string,
  userId: string,
  itemsAmount: DecimalValue,
): Promise<DiscountResult> {
  const row = await findCode(code, tx);
  const now = new Date();
  assertCodeAvailable(row, now);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${row.codeId}), hashtext(${userId}))`,
  );
  await assertUserLimit(tx, row, userId);
  const result = calculateDiscount(row, itemsAmount);

  const occupied = await tx
    .update(discountCodes)
    .set({
      usedCount: sql`${discountCodes.usedCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(discountCodes.id, row.codeId),
        eq(discountCodes.isActive, true),
        lte(discountCodes.startsAt, now),
        or(isNull(discountCodes.endsAt), gt(discountCodes.endsAt, now)),
        or(
          isNull(discountCodes.maxUses),
          lt(discountCodes.usedCount, discountCodes.maxUses),
        ),
      ),
    )
    .returning({ id: discountCodes.id });
  if (occupied.length === 0) {
    throw new BizError('CODE_EXHAUSTED', '折扣码使用次数已用完');
  }
  logger.info({ codeId: row.codeId, userId }, 'Discount code occupied');
  return result;
}

export async function recordDiscountRedemption(
  tx: DbTransaction,
  orderId: string,
  userId: string,
  discount: DiscountResult,
): Promise<void> {
  await tx.insert(discountRedemptions).values({
    codeId: discount.codeId,
    promotionId: discount.promotionId,
    userId,
    orderId,
    discountAmount: discount.discountAmount,
  });
}

export async function releaseDiscount(
  tx: DbTransaction,
  orderId: string,
): Promise<boolean> {
  const [released] = await tx
    .update(discountRedemptions)
    .set({ status: 'released', releasedAt: new Date() })
    .where(
      and(
        eq(discountRedemptions.orderId, orderId),
        ne(discountRedemptions.status, 'released'),
      ),
    )
    .returning({ codeId: discountRedemptions.codeId });
  if (!released) return false;
  await tx
    .update(discountCodes)
    .set({
      usedCount: sql`GREATEST(${discountCodes.usedCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(discountCodes.id, released.codeId));
  logger.info({ codeId: released.codeId, orderId }, 'Discount code released');
  return true;
}

export function calculateOrderAmounts(
  itemsAmount: DecimalValue,
  shippingAmount: DecimalValue,
  discount?: Pick<DiscountResult, 'discountAmount' | 'freeShipping'>,
): OrderAmounts {
  const items = new Decimal(itemsAmount);
  const discountAmount = Decimal.min(discount?.discountAmount ?? 0, items);
  const shipping = discount?.freeShipping
    ? new Decimal(0)
    : new Decimal(shippingAmount);
  return {
    itemsAmount: toFixed2(items),
    discountAmount: toFixed2(discountAmount),
    shippingAmount: toFixed2(shipping),
    payableAmount: toFixed2(items.minus(discountAmount).add(shipping)),
  };
}
