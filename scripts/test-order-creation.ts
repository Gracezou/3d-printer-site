import assert from 'node:assert/strict';

import { eq, inArray, sql } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  cartItems,
  carts,
  discountCodes,
  discountRedemptions,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  products,
  productVariants,
  promotions,
  shippingRules,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { createOrder } from '@/lib/services/order.service';
import { createOrderSchema } from '@/lib/validators/order';

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
  const addressIds: string[] = [];
  const materialIds: string[] = [];
  const promotionIds: string[] = [];
  const successfulOrderNos: string[] = [];
  let productId: string | undefined;
  let shippingRuleId: string | undefined;

  try {
    await db.insert(userProfiles).values([
      { id: userIds[0]!, phone: `131${suffix.slice(0, 8)}` },
      { id: userIds[1]!, phone: `130${suffix.slice(0, 8)}` },
    ]);
    const insertedAddresses = await db
      .insert(addresses)
      .values(
        userIds.map((userId, index) => ({
          userId,
          receiverName: `T054 用户 ${index + 1}`,
          receiverPhone: '13800138000',
          province: '广东省',
          provinceCode: '440000',
          city: '深圳市',
          district: '南山区',
          detail: `测试路 ${index + 1} 号`,
        })),
      )
      .returning({ id: addresses.id });
    addressIds.push(...insertedAddresses.map((item) => item.id));

    const [shippingRule] = await db
      .insert(shippingRules)
      .values({
        name: 'T054 广东运费',
        provinceCodes: ['440000'],
        firstAmount: '10.00',
        additionalAmount: '0.00',
        sortOrder: -300,
      })
      .returning({ id: shippingRules.id });
    assert(shippingRule);
    shippingRuleId = shippingRule.id;

    const insertedMaterials = await db
      .insert(materials)
      .values([
        {
          code: `T054-NORMAL-${suffix}`,
          name: 'T054 常规耗材',
          materialType: 'PLA',
          stockGrams: '1000.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
        },
        {
          code: `T054-RACE-${suffix}`,
          name: 'T054 并发耗材',
          materialType: 'PLA',
          stockGrams: '100.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
        },
      ])
      .returning({ id: materials.id });
    materialIds.push(...insertedMaterials.map((item) => item.id));
    const [normalMaterial, raceMaterial] = insertedMaterials;
    assert(normalMaterial && raceMaterial);

    const [product] = await db
      .insert(products)
      .values({
        name: 'T054 下单测试商品',
        slug: `t054-order-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;
    const insertedVariants = await db
      .insert(productVariants)
      .values([
        {
          productId,
          skuCode: `T054-NORMAL-${suffix}`,
          name: '常规款',
          price: '100.00',
          weightGrams: '100.00',
        },
        {
          productId,
          skuCode: `T054-RACE-${suffix}`,
          name: '并发款',
          price: '50.00',
          weightGrams: '100.00',
        },
        {
          productId,
          skuCode: `T054-NOBOM-${suffix}`,
          name: '无 BOM 款',
          price: '30.00',
        },
      ])
      .returning({ id: productVariants.id });
    const [normalVariant, raceVariant, noBomVariant] = insertedVariants;
    assert(normalVariant && raceVariant && noBomVariant);
    await db.insert(variantMaterials).values([
      {
        variantId: normalVariant.id,
        materialId: normalMaterial.id,
        grams: '10.00',
      },
      {
        variantId: raceVariant.id,
        materialId: raceMaterial.id,
        grams: '60.00',
      },
    ]);

    const insertedPromotions = await db
      .insert(promotions)
      .values([
        {
          name: 'T054 满百减二十',
          discountType: 'fixed_amount',
          discountValue: '20.00',
          minOrderAmount: '100.00',
        },
        {
          name: 'T054 限量减五元',
          discountType: 'fixed_amount',
          discountValue: '5.00',
        },
      ])
      .returning({ id: promotions.id });
    promotionIds.push(...insertedPromotions.map((item) => item.id));
    const [fixedPromotion, limitedPromotion] = insertedPromotions;
    assert(fixedPromotion && limitedPromotion);
    const codePrefix = `T054${suffix}`.toUpperCase();
    await db.insert(discountCodes).values([
      {
        promotionId: fixedPromotion.id,
        code: `${codePrefix}FIXED`,
        codeType: 'permanent',
      },
      {
        promotionId: limitedPromotion.id,
        code: `${codePrefix}LIMITED`,
        codeType: 'limited',
        maxUses: 1,
        perUserLimit: 1,
      },
    ]);

    const [cart] = await db
      .insert(carts)
      .values({ userId: userIds[0]! })
      .returning({ id: carts.id });
    assert(cart);
    await db.insert(cartItems).values({
      cartId: cart.id,
      variantId: normalVariant.id,
      quantity: 1,
    });

    assert.equal(
      createOrderSchema.safeParse({
        items: [{ variantId: normalVariant.id, quantity: 1 }],
        addressId: addressIds[0],
        itemsAmount: '0.01',
      }).success,
      false,
      '创建订单接口不得接受前端金额',
    );
    const basicOrder = await createOrder(userIds[0]!, {
      items: [{ variantId: normalVariant.id, quantity: 1 }],
      addressId: addressIds[0]!,
      discountCode: `${codePrefix}FIXED`,
      buyerRemark: 'T054 测试备注',
      fromCart: true,
    });
    successfulOrderNos.push(basicOrder.orderNo);
    assert.equal(basicOrder.payableAmount, '90.00');
    const [storedBasicOrder] = await db
      .select({
        id: orders.id,
        itemsAmount: orders.itemsAmount,
        discountAmount: orders.discountAmount,
        shippingAmount: orders.shippingAmount,
        payableAmount: orders.payableAmount,
      })
      .from(orders)
      .where(eq(orders.orderNo, basicOrder.orderNo));
    assert(storedBasicOrder);
    assert.deepEqual(
      {
        itemsAmount: storedBasicOrder.itemsAmount,
        discountAmount: storedBasicOrder.discountAmount,
        shippingAmount: storedBasicOrder.shippingAmount,
        payableAmount: storedBasicOrder.payableAmount,
      },
      {
        itemsAmount: '100.00',
        discountAmount: '20.00',
        shippingAmount: '10.00',
        payableAmount: '90.00',
      },
    );
    const [storedItem] = await db
      .select({
        unitPrice: orderItems.unitPrice,
        subtotal: orderItems.subtotal,
        bomSnapshot: orderItems.bomSnapshot,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, storedBasicOrder.id));
    assert.equal(storedItem?.unitPrice, '100.00');
    assert.equal(storedItem?.subtotal, '100.00');
    assert.equal(storedItem?.bomSnapshot[0]?.required_grams, '10');
    assert.equal(
      (await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)))
        .length,
      0,
      '成功下单后应清除当前购物车条目',
    );
    const [redemption] = await db
      .select({ status: discountRedemptions.status })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.orderId, storedBasicOrder.id));
    assert.equal(redemption?.status, 'occupied');

    await expectCode(
      () =>
        createOrder(userIds[0]!, {
          items: [{ variantId: noBomVariant.id, quantity: 1 }],
          addressId: addressIds[0]!,
          fromCart: false,
        }),
      40911,
    );

    const discountRace = await Promise.allSettled(
      userIds.map((userId, index) =>
        createOrder(userId, {
          items: [{ variantId: normalVariant.id, quantity: 1 }],
          addressId: addressIds[index]!,
          discountCode: `${codePrefix}LIMITED`,
          fromCart: false,
        }),
      ),
    );
    const discountSuccesses = discountRace.filter(
      (
        item,
      ): item is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createOrder>>
      > => item.status === 'fulfilled',
    );
    assert.equal(discountSuccesses.length, 1);
    successfulOrderNos.push(discountSuccesses[0]!.value.orderNo);
    const discountFailure = discountRace.find(
      (item) => item.status === 'rejected',
    );
    assert(discountFailure?.status === 'rejected');
    assert(discountFailure.reason instanceof BizError);
    assert.equal(discountFailure.reason.code, 40907);
    const [limitedCode] = await db
      .select({ usedCount: discountCodes.usedCount })
      .from(discountCodes)
      .where(eq(discountCodes.code, `${codePrefix}LIMITED`));
    assert.equal(limitedCode?.usedCount, 1);

    await db
      .update(materials)
      .set({ isActive: false })
      .where(eq(materials.id, raceMaterial.id));
    await expectCode(
      () =>
        createOrder(userIds[0]!, {
          items: [{ variantId: raceVariant.id, quantity: 1 }],
          addressId: addressIds[0]!,
          fromCart: false,
        }),
      40902,
    );
    await db
      .update(materials)
      .set({ isActive: true })
      .where(eq(materials.id, raceMaterial.id));

    const inventoryRace = await Promise.allSettled(
      userIds.map((userId, index) =>
        createOrder(userId, {
          items: [{ variantId: raceVariant.id, quantity: 1 }],
          addressId: addressIds[index]!,
          fromCart: false,
        }),
      ),
    );
    const inventorySuccesses = inventoryRace.filter(
      (
        item,
      ): item is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createOrder>>
      > => item.status === 'fulfilled',
    );
    assert.equal(inventorySuccesses.length, 1);
    successfulOrderNos.push(inventorySuccesses[0]!.value.orderNo);
    const inventoryFailure = inventoryRace.find(
      (item) => item.status === 'rejected',
    );
    assert(inventoryFailure?.status === 'rejected');
    assert(inventoryFailure.reason instanceof BizError);
    assert.equal(inventoryFailure.reason.code, 40901);
    const [raceStock] = await db
      .select({ reservedGrams: materials.reservedGrams })
      .from(materials)
      .where(eq(materials.id, raceMaterial.id));
    assert.equal(raceStock?.reservedGrams, '60.00');

    console.info(
      'T054 下单事务测试通过：数据库计价、BOM 后预扣、购物车清理、折扣码并发与耗材并发均符合预期。',
    );
  } finally {
    if (successfulOrderNos.length > 0) {
      const createdOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(inArray(orders.orderNo, successfulOrderNos));
      for (const order of createdOrders) {
        await db.execute(sql`SELECT fn_release_order_stock(${order.id}::uuid)`);
      }
      await db.delete(orders).where(
        inArray(
          orders.id,
          createdOrders.map((item) => item.id),
        ),
      );
    }
    if (materialIds.length > 0) {
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.materialId, materialIds));
    }
    if (promotionIds.length > 0) {
      await db
        .delete(discountCodes)
        .where(inArray(discountCodes.promotionId, promotionIds));
      await db.delete(promotions).where(inArray(promotions.id, promotionIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialIds.length > 0)
      await db.delete(materials).where(inArray(materials.id, materialIds));
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
