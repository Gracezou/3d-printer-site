import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  discountCodes,
  promotions,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createPromotion,
  deletePromotion,
  listPromotions,
  updatePromotion,
} from '@/lib/services/admin-promotion.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const promotionIds: string[] = [];

  try {
    const [adminRow] = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        name: adminUsers.name,
        roleCode: adminRoles.code,
        permissions: adminRoles.permissions,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(
        and(
          eq(adminRoles.code, 'super_admin'),
          eq(adminUsers.status, 'active'),
        ),
      )
      .limit(1);
    assert(adminRow, '需要已有的可用超级管理员账号');
    const admin: AdminIdentity = {
      sub: adminRow.id,
      username: adminRow.username,
      name: adminRow.name,
      roleCode: adminRow.roleCode,
      permissions: adminRow.permissions,
    };
    const context = { admin, ip: '127.0.0.1' };

    const fixed = await createPromotion(
      {
        name: `T080 满减 ${suffix}`,
        discountType: 'fixed_amount',
        discountValue: '10.00',
        minOrderAmount: '100.00',
        maxDiscountAmount: null,
        scope: 'all',
        scopeIds: [],
        isActive: true,
      },
      context,
    );
    promotionIds.push(fixed.id);
    const percentage = await createPromotion(
      {
        name: `T080 折扣 ${suffix}`,
        discountType: 'percentage',
        discountValue: '0.90',
        minOrderAmount: '50.00',
        maxDiscountAmount: '20.00',
        scope: 'all',
        scopeIds: [],
        isActive: true,
      },
      context,
    );
    promotionIds.push(percentage.id);
    const freeShipping = await createPromotion(
      {
        name: `T080 包邮 ${suffix}`,
        discountType: 'free_shipping',
        discountValue: '0',
        minOrderAmount: '199.00',
        maxDiscountAmount: null,
        scope: 'all',
        scopeIds: [],
        isActive: false,
      },
      context,
    );
    promotionIds.push(freeShipping.id);

    const listed = await listPromotions({
      keyword: suffix,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 3);
    assert.deepEqual(
      new Set(listed.list.map((item) => item.discountType)),
      new Set(['fixed_amount', 'percentage', 'free_shipping']),
    );

    const updated = await updatePromotion(
      percentage.id,
      { discountValue: '0.85', isActive: false },
      context,
    );
    assert.equal(updated.discountValue, '0.85');
    assert.equal(updated.isActive, false);

    await db.insert(discountCodes).values({
      promotionId: fixed.id,
      code: `T080${suffix}`.toUpperCase(),
      codeType: 'permanent',
      maxUses: null,
    });
    await assert.rejects(
      () => deletePromotion(fixed.id, context),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40001);
        return true;
      },
    );

    await deletePromotion(freeShipping.id, context);
    await db
      .delete(discountCodes)
      .where(eq(discountCodes.promotionId, fixed.id));
    await deletePromotion(fixed.id, context);
    await deletePromotion(percentage.id, context);
  } finally {
    if (promotionIds.length) {
      await db
        .delete(discountCodes)
        .where(inArray(discountCodes.promotionId, promotionIds));
      await db.delete(promotions).where(inArray(promotions.id, promotionIds));
    }
    if (promotionIds.length) {
      await db
        .delete(adminOperationLogs)
        .where(
          and(
            eq(adminOperationLogs.targetType, 'promotion'),
            inArray(adminOperationLogs.targetId, promotionIds),
          ),
        );
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Promotion functional test passed: fixed amount, percentage, free shipping, update, reference guard, and delete.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Promotion functional test failed: ${message}\n`);
  process.exitCode = 1;
});
