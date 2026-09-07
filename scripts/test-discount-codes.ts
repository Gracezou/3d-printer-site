import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  discountCodes,
  discountRedemptions,
  orders,
  promotions,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createDiscountCode,
  deleteDiscountCode,
  listDiscountCodes,
  listDiscountRedemptions,
  toggleDiscountCode,
  updateDiscountCode,
} from '@/lib/services/admin-discount-code.service';
import { previewDiscountCode } from '@/lib/services/promotion.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const codeIds: string[] = [];
  const userId = crypto.randomUUID();
  let promotionId: string | undefined;
  let orderId: string | undefined;

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

    const [promotion] = await db
      .insert(promotions)
      .values({
        name: `T081 折扣码测试 ${suffix}`,
        discountType: 'fixed_amount',
        discountValue: '10.00',
        minOrderAmount: '20.00',
      })
      .returning({ id: promotions.id });
    assert(promotion);
    promotionId = promotion.id;
    const now = Date.now();
    const past = new Date(now - 60 * 60_000);
    const older = new Date(now - 2 * 60 * 60_000);
    const future = new Date(now + 60 * 60_000);
    const later = new Date(now + 2 * 60 * 60_000);

    const active = await createDiscountCode(
      {
        promotionId: promotion.id,
        code: `t081a${suffix}`,
        codeType: 'limited',
        maxUses: 10,
        perUserLimit: 1,
        startsAt: past,
        endsAt: future,
        isActive: true,
        remark: '生效中',
      },
      context,
    );
    codeIds.push(active.id);
    assert.equal(active.code, `T081A${suffix}`.toUpperCase());

    const permanent = await createDiscountCode(
      {
        promotionId: promotion.id,
        code: `t081p${suffix}`,
        codeType: 'permanent',
        maxUses: null,
        perUserLimit: 2,
        startsAt: past,
        endsAt: null,
        isActive: false,
        remark: null,
      },
      context,
    );
    codeIds.push(permanent.id);
    assert.equal(permanent.maxUses, null);

    const notStarted = await createDiscountCode(
      {
        promotionId: promotion.id,
        code: `t081n${suffix}`,
        codeType: 'limited',
        maxUses: 3,
        perUserLimit: 1,
        startsAt: future,
        endsAt: later,
        isActive: true,
        remark: null,
      },
      context,
    );
    codeIds.push(notStarted.id);
    const expired = await createDiscountCode(
      {
        promotionId: promotion.id,
        code: `t081e${suffix}`,
        codeType: 'limited',
        maxUses: 3,
        perUserLimit: 1,
        startsAt: older,
        endsAt: past,
        isActive: true,
        remark: null,
      },
      context,
    );
    codeIds.push(expired.id);
    const exhausted = await createDiscountCode(
      {
        promotionId: promotion.id,
        code: `t081x${suffix}`,
        codeType: 'limited',
        maxUses: 1,
        perUserLimit: 1,
        startsAt: past,
        endsAt: future,
        isActive: true,
        remark: null,
      },
      context,
    );
    codeIds.push(exhausted.id);
    await db
      .update(discountCodes)
      .set({ usedCount: 1 })
      .where(eq(discountCodes.id, exhausted.id));

    const listed = await listDiscountCodes({
      keyword: suffix,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 5);
    const statuses = new Map(listed.list.map((code) => [code.id, code.status]));
    assert.equal(statuses.get(active.id), 'active');
    assert.equal(statuses.get(permanent.id), 'disabled');
    assert.equal(statuses.get(notStarted.id), 'not_started');
    assert.equal(statuses.get(expired.id), 'expired');
    assert.equal(statuses.get(exhausted.id), 'exhausted');
    assert.equal(
      (
        await listDiscountCodes({
          keyword: suffix,
          status: 'active',
          page: 1,
          pageSize: 20,
        })
      ).total,
      1,
    );

    await assert.rejects(
      () => updateDiscountCode(exhausted.id, { maxUses: 0 }, context),
      (error: unknown) => error instanceof Error,
    );
    const updated = await updateDiscountCode(
      active.id,
      { codeType: 'permanent', maxUses: null, perUserLimit: 3 },
      context,
    );
    assert.equal(updated.codeType, 'permanent');
    assert.equal(updated.maxUses, null);
    assert.equal(updated.perUserLimit, 3);

    await db.insert(userProfiles).values({
      id: userId,
      email: `t081-${suffix}@example.test`,
      phone: `130${Date.now().toString().slice(-8)}`,
    });
    const [order] = await db
      .insert(orders)
      .values({
        orderNo: `T081${suffix}`,
        userId,
        itemsAmount: '30.00',
        discountAmount: '10.00',
        payableAmount: '20.00',
        discountCodeId: active.id,
        discountCode: updated.code,
        receiverName: '核销测试',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 4 号',
      })
      .returning({ id: orders.id });
    assert(order);
    orderId = order.id;
    await db.insert(discountRedemptions).values({
      codeId: active.id,
      promotionId: promotion.id,
      userId,
      orderId: order.id,
      discountAmount: '10.00',
      status: 'confirmed',
    });
    const redemptionResult = await listDiscountRedemptions(active.id, {
      page: 1,
      pageSize: 20,
    });
    assert.equal(redemptionResult.total, 1);
    assert.equal(redemptionResult.list[0]?.orderNo, `T081${suffix}`);
    assert.equal(redemptionResult.list[0]?.userEmail, 't0***@example.test');
    await assert.rejects(
      () => deleteDiscountCode(active.id, context),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40001);
        return true;
      },
    );

    await toggleDiscountCode(active.id, false, context);
    await assert.rejects(
      () => previewDiscountCode(updated.code, userId, '30.00'),
      (error: unknown) => {
        assert(error instanceof BizError);
        assert.equal(error.code, 40906);
        return true;
      },
    );

    await deleteDiscountCode(notStarted.id, context);
  } finally {
    if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
    if (codeIds.length)
      await db.delete(discountCodes).where(inArray(discountCodes.id, codeIds));
    if (promotionId)
      await db.delete(promotions).where(eq(promotions.id, promotionId));
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await db
      .delete(adminOperationLogs)
      .where(
        and(
          eq(adminOperationLogs.targetType, 'discount_code'),
          inArray(adminOperationLogs.targetId, codeIds),
        ),
      );
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Discount-code functional test passed: uppercase normalization, five statuses, permanent rules, CRUD, immediate toggle, delete guard, and masked redemptions.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Discount-code test failed: ${message}\n`);
  process.exitCode = 1;
});
