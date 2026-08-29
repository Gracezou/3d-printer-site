import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  discountCodes,
  discountRedemptions,
  materials,
  orders,
  products,
  productVariants,
  promotions,
  shippingRules,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { previewOrder } from '@/lib/services/order-preview.service';
import { orderPreviewSchema } from '@/lib/validators/order';

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

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds = [crypto.randomUUID(), crypto.randomUUID()];
  const promotionIds: string[] = [];
  let productId: string | undefined;
  let materialId: string | undefined;
  let shippingRuleId: string | undefined;
  let redemptionOrderId: string | undefined;

  try {
    await db.insert(userProfiles).values([
      { id: userIds[0]!, phone: `133${suffix.slice(0, 8)}` },
      { id: userIds[1]!, phone: `132${suffix.slice(0, 8)}` },
    ]);
    const [address] = await db
      .insert(addresses)
      .values({
        userId: userIds[0]!,
        receiverName: 'T053 用户',
        receiverPhone: '13800138000',
        province: '广东省',
        provinceCode: '440000',
        city: '深圳市',
        district: '南山区',
        detail: '测试路 53 号',
      })
      .returning({ id: addresses.id });
    assert(address);

    const [rule] = await db
      .insert(shippingRules)
      .values({
        name: 'T053 广东运费',
        provinceCodes: ['440000'],
        firstWeightGrams: '1000.00',
        firstAmount: '10.00',
        additionalWeightGrams: '500.00',
        additionalAmount: '5.00',
        sortOrder: -200,
      })
      .returning({ id: shippingRules.id });
    assert(rule);
    shippingRuleId = rule.id;

    const [material] = await db
      .insert(materials)
      .values({
        code: `T053-${suffix}`,
        name: 'T053 试算耗材',
        materialType: 'PLA',
        stockGrams: '100.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;
    const [product] = await db
      .insert(products)
      .values({
        name: 'T053 试算商品',
        slug: `t053-preview-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `T053-${suffix}`,
        name: '标准款',
        price: '50.00',
        weightGrams: '600.00',
      })
      .returning({ id: productVariants.id });
    assert(variant);
    await db.insert(variantMaterials).values({
      variantId: variant.id,
      materialId,
      grams: '50.00',
    });

    const insertedPromotions = await db
      .insert(promotions)
      .values([
        {
          name: 'T053 满百减二十',
          discountType: 'fixed_amount',
          discountValue: '20.00',
          minOrderAmount: '100.00',
        },
        {
          name: 'T053 无门槛',
          discountType: 'fixed_amount',
          discountValue: '5.00',
        },
      ])
      .returning({ id: promotions.id });
    promotionIds.push(...insertedPromotions.map((item) => item.id));
    const [thresholdPromotion, openPromotion] = insertedPromotions;
    assert(thresholdPromotion && openPromotion);
    const codePrefix = `T053${suffix}`.toUpperCase();
    const insertedCodes = await db
      .insert(discountCodes)
      .values([
        {
          promotionId: thresholdPromotion.id,
          code: `${codePrefix}VALID`,
          codeType: 'permanent',
        },
        {
          promotionId: thresholdPromotion.id,
          code: `${codePrefix}FUTURE`,
          codeType: 'permanent',
          startsAt: new Date(Date.now() + 86_400_000),
        },
        {
          promotionId: openPromotion.id,
          code: `${codePrefix}EMPTY`,
          codeType: 'limited',
          maxUses: 1,
          usedCount: 1,
        },
        {
          promotionId: openPromotion.id,
          code: `${codePrefix}USED`,
          codeType: 'permanent',
        },
      ])
      .returning({
        id: discountCodes.id,
        code: discountCodes.code,
        promotionId: discountCodes.promotionId,
      });
    const usedCode = insertedCodes.find(
      (item) => item.code === `${codePrefix}USED`,
    );
    assert(usedCode);

    const [redemptionOrder] = await db
      .insert(orders)
      .values({
        orderNo: `T053${suffix}`,
        userId: userIds[0]!,
        itemsAmount: '50.00',
        discountAmount: '5.00',
        shippingAmount: '0.00',
        payableAmount: '45.00',
        receiverName: 'T053 用户',
        receiverPhone: '13800138000',
        receiverProvince: '广东省',
        receiverCity: '深圳市',
        receiverDistrict: '南山区',
        receiverDetail: '测试路 53 号',
      })
      .returning({ id: orders.id });
    assert(redemptionOrder);
    redemptionOrderId = redemptionOrder.id;
    await db.insert(discountRedemptions).values({
      codeId: usedCode.id,
      promotionId: usedCode.promotionId,
      userId: userIds[0]!,
      orderId: redemptionOrderId,
      discountAmount: '5.00',
      status: 'confirmed',
    });

    assert.equal(
      orderPreviewSchema.safeParse({
        items: [{ variantId: variant.id, quantity: 2 }],
        itemsAmount: '0.01',
      }).success,
      false,
      '试算参数不得接受前端金额',
    );
    const valid = await previewOrder(userIds[0]!, {
      items: [{ variantId: variant.id, quantity: 2 }],
      addressId: address.id,
      discountCode: `${codePrefix}VALID`,
    });
    assert.deepEqual(valid, {
      itemsAmount: '100.00',
      discountAmount: '20.00',
      shippingAmount: '15.00',
      payableAmount: '95.00',
      discount: {
        code: `${codePrefix}VALID`,
        name: 'T053 满百减二十',
        type: 'fixed_amount',
      },
      unavailableItems: [],
    });
    const [validCodeAfterPreview] = await db
      .select({ usedCount: discountCodes.usedCount })
      .from(discountCodes)
      .where(eq(discountCodes.code, `${codePrefix}VALID`));
    const [materialAfterPreview] = await db
      .select({ reservedGrams: materials.reservedGrams })
      .from(materials)
      .where(eq(materials.id, materialId));
    assert.equal(validCodeAfterPreview?.usedCount, 0, '试算不得占用折扣码');
    assert.equal(
      materialAfterPreview?.reservedGrams,
      '0.00',
      '试算不得预扣耗材',
    );

    await expectCode(
      () =>
        previewOrder(userIds[1]!, {
          items: [{ variantId: variant.id, quantity: 2 }],
          addressId: address.id,
        }),
      40403,
    );
    const shortage = await previewOrder(userIds[0]!, {
      items: [{ variantId: variant.id, quantity: 3 }],
    });
    assert.deepEqual(shortage.unavailableItems, [
      {
        variantId: variant.id,
        requestedQty: 3,
        availableQty: 2,
        reason: 'out_of_stock',
      },
    ]);

    const baseInput = {
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    await expectCode(
      () =>
        previewOrder(userIds[0]!, {
          ...baseInput,
          discountCode: `${codePrefix}MISSING`,
        }),
      40905,
    );
    await expectCode(
      () =>
        previewOrder(userIds[0]!, {
          ...baseInput,
          discountCode: `${codePrefix}FUTURE`,
        }),
      40906,
    );
    await expectCode(
      () =>
        previewOrder(userIds[0]!, {
          ...baseInput,
          discountCode: `${codePrefix}EMPTY`,
        }),
      40907,
    );
    await expectCode(
      () =>
        previewOrder(userIds[0]!, {
          ...baseInput,
          discountCode: `${codePrefix}USED`,
        }),
      40908,
    );
    await expectCode(
      () =>
        previewOrder(userIds[0]!, {
          ...baseInput,
          discountCode: `${codePrefix}VALID`,
        }),
      40909,
    );

    await db
      .update(products)
      .set({ status: 'off_shelf' })
      .where(eq(products.id, productId));
    const offShelf = await previewOrder(userIds[0]!, baseInput);
    assert.equal(offShelf.unavailableItems[0]?.reason, 'off_shelf');
    console.info(
      'T053 下单试算测试通过：数据库金额、地址归属、实时可售状态及折扣码 40905~40909 均符合预期。',
    );
  } finally {
    if (redemptionOrderId)
      await db.delete(orders).where(eq(orders.id, redemptionOrderId));
    if (promotionIds.length > 0) {
      await db
        .delete(discountCodes)
        .where(inArray(discountCodes.promotionId, promotionIds));
      await db.delete(promotions).where(inArray(promotions.id, promotionIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    if (shippingRuleId)
      await db
        .delete(shippingRules)
        .where(eq(shippingRules.id, shippingRuleId));
    await db.delete(userProfiles).where(inArray(userProfiles.id, userIds));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
