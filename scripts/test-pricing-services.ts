import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  discountCodes,
  orders,
  promotions,
  shippingRules,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  applyDiscountCode,
  calculateOrderAmounts,
  previewDiscountCode,
  recordDiscountRedemption,
  releaseDiscount,
} from '@/lib/services/promotion.service';
import { calculateShipping } from '@/lib/services/shipping.service';

async function expectCode(
  action: () => Promise<unknown>,
  code: number,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert(error instanceof BizError);
    assert.equal(error.code, code);
    return true;
  });
}

async function insertOrder(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  userId: string,
  suffix: string,
): Promise<string> {
  const [order] = await tx
    .insert(orders)
    .values({
      orderNo: `T052${suffix}`.slice(0, 32),
      userId,
      itemsAmount: '100.00',
      discountAmount: '20.00',
      shippingAmount: '10.00',
      payableAmount: '90.00',
      receiverName: '测试用户',
      receiverPhone: '13800138000',
      receiverProvince: '广东省',
      receiverCity: '深圳市',
      receiverDistrict: '南山区',
      receiverDetail: '测试路 1 号',
    })
    .returning({ id: orders.id });
  assert(order);
  return order.id;
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds = [crypto.randomUUID(), crypto.randomUUID()];
  const promotionIds: string[] = [];
  const shippingRuleIds: string[] = [];
  const orderIds: string[] = [];

  try {
    await db.insert(userProfiles).values([
      { id: userIds[0]!, phone: `135${suffix.slice(0, 8)}` },
      { id: userIds[1]!, phone: `134${suffix.slice(0, 8)}` },
    ]);

    const insertedRules = await db
      .insert(shippingRules)
      .values([
        {
          name: 'T052 广东规则',
          provinceCodes: ['440000'],
          firstWeightGrams: '1000.00',
          firstAmount: '12.00',
          additionalWeightGrams: '500.00',
          additionalAmount: '3.00',
          freeThreshold: '200.00',
          sortOrder: -100,
        },
        {
          name: 'T052 默认规则',
          provinceCodes: [],
          firstWeightGrams: '1000.00',
          firstAmount: '8.00',
          additionalWeightGrams: '500.00',
          additionalAmount: '2.00',
          sortOrder: -100,
        },
      ])
      .returning({ id: shippingRules.id });
    shippingRuleIds.push(...insertedRules.map((item) => item.id));

    assert.equal(
      (await calculateShipping('440000', '1600', '100')).amount,
      '18.00',
    );
    assert.equal(
      (await calculateShipping('440000', '1600', '200')).amount,
      '0.00',
    );
    assert.equal(
      (await calculateShipping('110000', '1500', '100')).amount,
      '10.00',
    );

    const insertedPromotions = await db
      .insert(promotions)
      .values([
        {
          name: 'T052 满百减二十',
          discountType: 'fixed_amount',
          discountValue: '20.00',
          minOrderAmount: '100.00',
        },
        {
          name: 'T052 九折',
          discountType: 'percentage',
          discountValue: '0.90',
        },
        {
          name: 'T052 包邮',
          discountType: 'free_shipping',
          discountValue: '0.00',
        },
        {
          name: 'T052 并发限次',
          discountType: 'fixed_amount',
          discountValue: '5.00',
        },
      ])
      .returning({ id: promotions.id });
    promotionIds.push(...insertedPromotions.map((item) => item.id));
    const [
      fixedPromotion,
      percentagePromotion,
      freePromotion,
      limitedPromotion,
    ] = insertedPromotions;
    assert(
      fixedPromotion &&
        percentagePromotion &&
        freePromotion &&
        limitedPromotion,
    );

    const codePrefix = `T052${suffix}`.toUpperCase();
    // Avoid treating freshly inserted codes as future codes when the database
    // clock is slightly ahead of the application host running this acceptance test.
    const activeStartsAt = new Date(Date.now() - 60_000);
    await db.insert(discountCodes).values([
      {
        promotionId: fixedPromotion.id,
        code: `${codePrefix}FIXED`,
        codeType: 'permanent',
        startsAt: activeStartsAt,
      },
      {
        promotionId: percentagePromotion.id,
        code: `${codePrefix}PERCENT`,
        codeType: 'permanent',
        startsAt: activeStartsAt,
      },
      {
        promotionId: freePromotion.id,
        code: `${codePrefix}FREE`,
        codeType: 'permanent',
        startsAt: activeStartsAt,
      },
      {
        promotionId: limitedPromotion.id,
        code: `${codePrefix}LIMITED`,
        codeType: 'limited',
        maxUses: 1,
        startsAt: activeStartsAt,
      },
      {
        promotionId: fixedPromotion.id,
        code: `${codePrefix}FUTURE`,
        codeType: 'permanent',
        startsAt: new Date(Date.now() + 86_400_000),
      },
    ]);

    await expectCode(
      () => previewDiscountCode(`${codePrefix}FIXED`, userIds[0]!, '99.99'),
      40909,
    );
    await expectCode(
      () => previewDiscountCode(`${codePrefix}FUTURE`, userIds[0]!, '100.00'),
      40906,
    );
    const fixed = await previewDiscountCode(
      `${codePrefix.toLowerCase()}fixed`,
      userIds[0]!,
      '100.00',
    );
    assert.equal(fixed.discountAmount, '20.00');
    assert.deepEqual(calculateOrderAmounts('100', '10', fixed), {
      itemsAmount: '100.00',
      discountAmount: '20.00',
      shippingAmount: '10.00',
      payableAmount: '90.00',
    });
    const percentage = await previewDiscountCode(
      `${codePrefix}PERCENT`,
      userIds[0]!,
      '199.99',
    );
    assert.equal(percentage.discountAmount, '19.99');
    const freeShipping = await previewDiscountCode(
      `${codePrefix}FREE`,
      userIds[0]!,
      '50.00',
    );
    assert.equal(
      calculateOrderAmounts('50', '10', freeShipping).shippingAmount,
      '0.00',
    );

    const occupiedOrderId = await db.transaction(async (tx) => {
      const discount = await applyDiscountCode(
        tx,
        `${codePrefix}FIXED`,
        userIds[0]!,
        '100.00',
      );
      const orderId = await insertOrder(tx, userIds[0]!, `${suffix}A`);
      await recordDiscountRedemption(tx, orderId, userIds[0]!, discount);
      return orderId;
    });
    orderIds.push(occupiedOrderId);
    await expectCode(
      () => previewDiscountCode(`${codePrefix}FIXED`, userIds[0]!, '100.00'),
      40908,
    );
    assert.equal(
      await db.transaction((tx) => releaseDiscount(tx, occupiedOrderId)),
      true,
    );
    assert.equal(
      await db.transaction((tx) => releaseDiscount(tx, occupiedOrderId)),
      false,
    );
    await previewDiscountCode(`${codePrefix}FIXED`, userIds[0]!, '100.00');

    const sameUserResults = await Promise.allSettled(
      [0, 1].map((index) =>
        db.transaction(async (tx) => {
          const discount = await applyDiscountCode(
            tx,
            `${codePrefix}FIXED`,
            userIds[0]!,
            '100.00',
          );
          const orderId = await insertOrder(
            tx,
            userIds[0]!,
            `${suffix}U${index}`,
          );
          await recordDiscountRedemption(tx, orderId, userIds[0]!, discount);
          orderIds.push(orderId);
        }),
      ),
    );
    assert.equal(
      sameUserResults.filter((item) => item.status === 'fulfilled').length,
      1,
    );
    const userLimitRejection = sameUserResults.find(
      (item) => item.status === 'rejected',
    );
    assert(userLimitRejection?.status === 'rejected');
    assert(userLimitRejection.reason instanceof BizError);
    assert.equal(userLimitRejection.reason.code, 40908);

    const concurrentResults = await Promise.allSettled(
      userIds.map((userId, index) =>
        db.transaction(async (tx) => {
          const discount = await applyDiscountCode(
            tx,
            `${codePrefix}LIMITED`,
            userId,
            '100.00',
          );
          const orderId = await insertOrder(tx, userId, `${suffix}C${index}`);
          await recordDiscountRedemption(tx, orderId, userId, discount);
          orderIds.push(orderId);
        }),
      ),
    );
    assert.equal(
      concurrentResults.filter((item) => item.status === 'fulfilled').length,
      1,
    );
    const rejected = concurrentResults.find(
      (item) => item.status === 'rejected',
    );
    assert(rejected && rejected.status === 'rejected');
    assert(rejected.reason instanceof BizError);
    assert.equal(rejected.reason.code, 40907);

    const [limitedCode] = await db
      .select({ usedCount: discountCodes.usedCount })
      .from(discountCodes)
      .where(eq(discountCodes.code, `${codePrefix}LIMITED`));
    assert.equal(limitedCode?.usedCount, 1);
    console.info(
      'T052 计价服务测试通过：续重/免邮、优惠不减运费、向下取整、用户限次、原子占用与释放均符合预期。',
    );
  } finally {
    if (orderIds.length > 0)
      await db.delete(orders).where(inArray(orders.id, orderIds));
    if (promotionIds.length > 0) {
      await db
        .delete(discountCodes)
        .where(inArray(discountCodes.promotionId, promotionIds));
      await db.delete(promotions).where(inArray(promotions.id, promotionIds));
    }
    if (shippingRuleIds.length > 0)
      await db
        .delete(shippingRules)
        .where(inArray(shippingRules.id, shippingRuleIds));
    await db.delete(userProfiles).where(inArray(userProfiles.id, userIds));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
