import assert from 'node:assert/strict';

import { eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  materials,
  products,
  productVariants,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  addCartItem,
  listCartItems,
  removeCartItem,
  updateCartItem,
} from '@/lib/services/cart.service';

async function expectBizError(
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
  let productId: string | undefined;
  let materialId: string | undefined;

  try {
    await db.insert(userProfiles).values([
      { id: userIds[0]!, phone: `138${suffix.slice(0, 8)}` },
      { id: userIds[1]!, phone: `139${suffix.slice(0, 8)}` },
    ]);
    const [material] = await db
      .insert(materials)
      .values({
        code: `T050-${suffix}`,
        name: 'T050 购物车测试耗材',
        materialType: 'PLA',
        stockGrams: '30.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    assert(material);
    materialId = material.id;

    const [product] = await db
      .insert(products)
      .values({
        name: 'T050 购物车测试商品',
        slug: `t050-cart-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    assert(product);
    productId = product.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `T050-VARIANT-${suffix}`,
        name: '标准款',
        price: '12.50',
      })
      .returning({ id: productVariants.id });
    assert(variant);
    await db.insert(variantMaterials).values({
      variantId: variant.id,
      materialId,
      grams: '10.00',
    });

    const created = await addCartItem(userIds[0]!, {
      variantId: variant.id,
      quantity: 2,
    });
    assert.equal(created.quantity, 2);
    await expectBizError(
      () => addCartItem(userIds[0]!, { variantId: variant.id, quantity: 2 }),
      40901,
    );
    await expectBizError(
      () => updateCartItem(userIds[1]!, created.id, 1),
      40401,
    );
    await expectBizError(() => removeCartItem(userIds[1]!, created.id), 40401);

    const updated = await updateCartItem(userIds[0]!, created.id, 3);
    assert.equal(updated.quantity, 3);
    const availableCart = await listCartItems(userIds[0]!);
    assert.equal(availableCart.length, 1);
    assert.equal(availableCart[0]?.subtotal, '37.50');
    assert.equal(availableCart[0]?.isAvailable, true);

    await db
      .update(products)
      .set({ status: 'off_shelf' })
      .where(eq(products.id, productId));
    const offShelfCart = await listCartItems(userIds[0]!);
    assert.equal(offShelfCart[0]?.isAvailable, false);
    assert.equal(offShelfCart[0]?.unavailableReason, 'off_shelf');

    await removeCartItem(userIds[0]!, created.id);
    assert.deepEqual(await listCartItems(userIds[0]!), []);
    console.info(
      'T050 购物车测试通过：实时库存上限、用户隔离、金额计算、下架失效和删除均符合预期。',
    );
  } finally {
    await db.delete(userProfiles).where(inArray(userProfiles.id, userIds));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
