import assert from 'node:assert/strict';
import { eq, inArray, sql } from 'drizzle-orm';
import { assertLocalDatabaseUrl } from './assert-local-database';
import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import {
  adminRoles,
  adminUsers,
  adminOperationLogs,
  materials,
  materialStockMovements,
  products,
  productStyles,
  productVariants,
  variantMaterials,
  userProfiles,
  addresses,
  orders,
  orderItems,
  shippingRules,
} from '@/lib/db/schema';
import { replaceProductStyles } from '@/lib/services/product-style.service';
import { getProductDetail } from '@/lib/services/product.service';
import {
  createMaterial,
  updateMaterial,
  toggleMaterial,
  stockInMaterial,
} from '@/lib/services/material.service';
import { replaceProductStylesSchema } from '@/lib/validators/product-style';
import { getByVariantIds } from '@/lib/services/availability.service';
import {
  productStyleDrafts,
  previewLegacyStyles,
} from '@/lib/product-style-model';
import {
  getStorefrontProductBySlug,
  listStorefrontProducts,
} from '@/lib/services/storefront.service';
import { storefrontProductListQuerySchema } from '@/lib/validators/storefront';
import { addCartItem, listCartItems } from '@/lib/services/cart.service';
import { createOrder } from '@/lib/services/order.service';
import { cancelCustomerOrder } from '@/lib/services/customer-order.service';

async function main() {
  assertLocalDatabaseUrl(process.env.DATABASE_URL, false);
  const db = getDb();
  const stamp = crypto.randomUUID().slice(0, 8);
  const roleId = crypto.randomUUID(),
    adminId = crypto.randomUUID(),
    productId = crypto.randomUUID(),
    otherProductId = crypto.randomUUID(),
    userId = crypto.randomUUID(),
    shippingId = crypto.randomUUID();
  const materialIds: string[] = [];
  try {
    await db.insert(adminRoles).values({
      id: roleId,
      code: `style-${stamp}`,
      name: '款式隔离测试',
      permissions: ['product:edit', 'material:edit'],
    });
    await db.insert(adminUsers).values({
      id: adminId,
      roleId,
      username: `style-${stamp}`,
      name: '款式隔离测试',
      passwordHash: 'not-a-login-hash',
    });
    const context = {
      admin: {
        sub: adminId,
        username: `style-${stamp}`,
        name: '测试',
        roleCode: `style-${stamp}`,
        permissions: ['product:edit', 'material:edit'],
      },
      ip: '127.0.0.1',
    };
    await db.insert(products).values([
      {
        id: productId,
        name: '款式配色测试',
        slug: `styles-${stamp}`,
        status: 'on_sale',
      },
      { id: otherProductId, name: '隔离商品', slug: `other-styles-${stamp}` },
    ]);
    await db
      .insert(userProfiles)
      .values({ id: userId, email: `styles-${stamp}@example.invalid` });
    const [address] = await db
      .insert(addresses)
      .values({
        userId,
        receiverName: '本地测试',
        receiverPhone: '13800000000',
        province: '上海市',
        provinceCode: '310000',
        city: '上海市',
        district: '测试区',
        detail: '测试地址',
      })
      .returning();
    assert(address);
    await db.insert(shippingRules).values({
      id: shippingId,
      name: `styles-${stamp}`,
      provinceCodes: ['310000'],
      sortOrder: -999999,
      firstAmount: '0.00',
    });
    async function makeMaterial(
      color: string,
      stock: string,
      colorHex: string,
    ) {
      const material = await createMaterial(
        {
          code: 'generated',
          name: 'generated',
          materialType: 'PLA',
          brand: stamp,
          colorName: color,
          colorHex,
          unitCostPerKg: '50.00',
          safetyGrams: '0.00',
          wasteRate: '0.0000',
        },
        context,
      );
      materialIds.push(material.id);
      if (Number(stock) > 0)
        await stockInMaterial(
          material.id,
          { grams: stock, unitCostPerKg: '50.00' },
          context,
        );
      return material;
    }
    const black = await makeMaterial('黑', '100.00', '#000000');
    const white = await makeMaterial('白', '20.00', '#FFFFFF');
    const initial = replaceProductStylesSchema.parse({
      styles: [
        {
          name: '标准款',
          price: '29.00',
          weightGrams: '30.00',
          materialGrams: '30.00',
          imageUrl: 'https://example.invalid/style.png',
          isActive: true,
          singleMaterialMode: 'all',
          colorways: [
            {
              name: '黑白拼色',
              imageUrl: 'https://example.invalid/dual.png',
              bom: [
                { materialId: black.id, grams: '10.00' },
                { materialId: black.id, grams: '10.00' },
                { materialId: white.id, grams: '10.00' },
              ],
            },
          ],
        },
      ],
    });
    let detail = await replaceProductStyles(productId, initial, context);
    const styleId = detail.styles[0]!.id;
    const dual = detail.variants.find(
      (v) => v.attributes.color === '黑白拼色',
    )!;
    assert(dual);
    assert.equal(dual.bom.length, 2);
    assert.equal(
      dual.bom.find((b) => b.materialId === black.id)?.grams,
      '20.00',
    );
    assert.equal(
      (await getByVariantIds([dual.id]))[0]?.availableQty,
      2,
      'both BOM materials constrain quantity',
    );
    const firstBlack = detail.variants.find(
      (v) => v.sourceMaterialId === black.id,
    )!;
    assert(firstBlack);
    await updateMaterial(white.id, { wasteRate: '0.1000' }, context);
    assert.equal(
      (await getByVariantIds([dual.id]))[0]?.availableQty,
      1,
      'loss rate is included once per material',
    );
    await updateMaterial(white.id, { wasteRate: '0.0000' }, context);
    await addCartItem(userId, { variantId: firstBlack.id, quantity: 1 });
    assert.equal(
      (await listCartItems(userId))[0]?.imageUrl,
      'https://example.invalid/style.png',
    );
    const publicDetail = await getStorefrontProductBySlug(`styles-${stamp}`);
    const filtered = await listStorefrontProducts(
      storefrontProductListQuerySchema.parse({
        keyword: '款式配色测试',
        materialType: 'PLA',
      }),
    );
    assert(
      filtered.list.some((p) => p.id === productId),
      'material filtering uses the real BOM rather than extra purchase dimensions',
    );
    assert.equal(
      publicDetail.variants.find((v) => v.id === firstBlack.id)?.imageUrl,
      'https://example.invalid/style.png',
    );
    assert.equal(
      publicDetail.variants.find((v) => v.id === dual.id)?.colors.length,
      2,
    );
    const red = await makeMaterial('红', '0.00', '#FF0000');
    detail = await getProductDetail(productId);
    const redSku = detail.variants.find((v) => v.sourceMaterialId === red.id)!;
    assert(redSku, 'new materials automatically generate single-color SKUs');
    assert.equal((await getByVariantIds([redSku.id]))[0]?.availableQty, 0);
    await stockInMaterial(
      red.id,
      { grams: '60.00', unitCostPerKg: '50.00' },
      context,
    );
    assert.equal((await getByVariantIds([redSku.id]))[0]?.availableQty, 2);
    await toggleMaterial(red.id, false, context);
    assert.equal((await getByVariantIds([redSku.id]))[0]?.availableQty, 0);
    await toggleMaterial(red.id, true, context);
    assert.equal(
      (await getProductDetail(productId)).variants.find(
        (v) => v.sourceMaterialId === red.id,
      )?.id,
      redSku.id,
      're-enable preserves SKU ID',
    );
    await updateMaterial(red.id, { colorName: '朱红' }, context);
    assert(
      (await getProductDetail(productId)).variants
        .find((v) => v.id === redSku.id)
        ?.attributes.color.includes('朱红'),
    );
    const created = await createOrder(userId, {
      items: [{ variantId: dual.id, quantity: 2 }],
      addressId: address.id,
      fromCart: false,
    });
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNo, created.orderNo));
    assert(order);
    const [snapshot] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    assert(snapshot);
    assert.equal(snapshot.imageUrl, 'https://example.invalid/dual.png');
    assert.equal(
      (await getByVariantIds([dual.id]))[0]?.availableQty,
      0,
      'reservation makes multi-color unavailable',
    );
    const before = JSON.stringify(snapshot.bomSnapshot);
    const savedDraft = productStyleDrafts(await getProductDetail(productId));
    savedDraft[0]!.materialGrams = '40.00';
    savedDraft[0]!.colorways[0]!.bom[0]!.grams = '25.00';
    await replaceProductStyles(
      productId,
      replaceProductStylesSchema.parse({ styles: savedDraft }),
      context,
    );
    const [unchanged] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, snapshot.id));
    assert.equal(
      JSON.stringify(unchanged?.bomSnapshot),
      before,
      'editing a scheme must never rewrite ordered BOM snapshots',
    );
    await cancelCustomerOrder(userId, created.orderNo);
    const [whiteStock] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, white.id));
    assert.equal(
      whiteStock?.reservedGrams,
      '0.00',
      'cancellation releases the old snapshot quantity',
    );
    await assert.rejects(() =>
      replaceProductStyles(
        otherProductId,
        replaceProductStylesSchema.parse({ styles: savedDraft }),
        context,
      ),
    );
    const singleBefore = (await getProductDetail(productId)).variants.find(
      (v) => v.sourceMaterialId === black.id,
    )!.id;
    const concurrentDraft = productStyleDrafts(
      await getProductDetail(productId),
    );
    const [blue] = await Promise.all([
      makeMaterial('蓝', '10.00', '#0000FF'),
      replaceProductStyles(
        productId,
        replaceProductStylesSchema.parse({ styles: concurrentDraft }),
        context,
      ),
    ]);
    detail = await getProductDetail(productId);
    assert.equal(
      detail.variants.filter((v) => v.sourceMaterialId === blue.id).length,
      1,
      'concurrent style/material writes generate exactly one SKU',
    );
    assert.equal(
      detail.variants.find((v) => v.sourceMaterialId === black.id)?.id,
      singleBefore,
    );
    const finalDraft = productStyleDrafts(detail);
    finalDraft[0]!.colorways = [];
    await replaceProductStyles(
      productId,
      replaceProductStylesSchema.parse({ styles: finalDraft }),
      context,
    );
    const archived = (await getProductDetail(productId)).variants.find(
      (v) => v.id === dual.id,
    )!;
    assert.equal(archived.isActive, false);
    assert.equal(archived.styleId, null);
    const selectedStyles = productStyleDrafts(
      await getProductDetail(productId),
    );
    selectedStyles.push({
      ...selectedStyles[0]!,
      id: null,
      name: '支架款',
      singleMaterialMode: 'selected',
      materialIds: [black.id],
      singleImages: [],
      colorways: [],
      materialGrams: '50.00',
    });
    const selectedSaved = await replaceProductStyles(
      productId,
      replaceProductStylesSchema.parse({ styles: selectedStyles }),
      context,
    );
    const stand = selectedSaved.styles.find((s) => s.name === '支架款')!;
    const green = await makeMaterial('绿', '100.00', '#00FF00');
    assert.equal(
      (await getProductDetail(productId)).variants.filter(
        (v) => v.styleId === stand.id && v.sourceMaterialId === green.id,
      ).length,
      0,
      'selected mode must not enroll new materials',
    );
    const legacyId = crypto.randomUUID();
    await db.insert(productVariants).values({
      id: legacyId,
      productId: otherProductId,
      skuCode: `legacy-${stamp}`,
      name: '旧款黑色',
      attributes: { 尺寸: '旧款', 颜色: '黑色' },
      price: '10.00',
      weightGrams: '5.00',
    });
    await db
      .insert(variantMaterials)
      .values({ variantId: legacyId, materialId: black.id, grams: '5.00' });
    const imported = await replaceProductStyles(
      otherProductId,
      replaceProductStylesSchema.parse({
        styles: previewLegacyStyles(await getProductDetail(otherProductId)),
      }),
      context,
    );
    assert.equal(
      imported.variants.find((v) => v.isActive)?.id,
      legacyId,
      'legacy review/import keeps the original SKU ID',
    );
    const concurrentOrderDraft = productStyleDrafts(
      await getProductDetail(productId),
    );
    const concurrentRed = (await getProductDetail(productId)).variants.find(
      (v) => v.sourceMaterialId === red.id,
    )!;
    const [, concurrentOrder] = await Promise.all([
      updateMaterial(red.id, { colorName: '红色更新' }, context),
      createOrder(userId, {
        items: [{ variantId: concurrentRed.id, quantity: 1 }],
        addressId: address.id,
        fromCart: false,
      }),
    ]);
    await cancelCustomerOrder(userId, concurrentOrder.orderNo);
    await replaceProductStyles(
      productId,
      replaceProductStylesSchema.parse({ styles: concurrentOrderDraft }),
      context,
    );
    const [rls] = await db.execute(
      sql`SELECT relrowsecurity, has_table_privilege('anon','product_styles','SELECT') AS public_read FROM pg_class WHERE oid='product_styles'::regclass`,
    );
    assert.equal(rls?.relrowsecurity, true);
    assert.equal(rls?.public_read, false);
    assert.equal(
      (
        await db
          .select()
          .from(productStyles)
          .where(eq(productStyles.id, styleId))
      ).length,
      1,
    );
    process.stdout.write(
      'Product styles passed: all-material sync, multi-color limits, replenishment, stable IDs, concurrency, images, real checkout/reservation, historical BOM, cancellation and RLS.\n',
    );
  } finally {
    const testOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId));
    if (testOrders.length) {
      const ids = testOrders.map((o) => o.id);
      await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
      await db.delete(orders).where(inArray(orders.id, ids));
    }
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await db
      .delete(products)
      .where(inArray(products.id, [productId, otherProductId]));
    if (materialIds.length) {
      await db
        .delete(materialStockMovements)
        .where(inArray(materialStockMovements.materialId, materialIds));
      await db.delete(materials).where(inArray(materials.id, materialIds));
    }
    await db.delete(shippingRules).where(eq(shippingRules.id, shippingId));
    await db
      .delete(adminOperationLogs)
      .where(eq(adminOperationLogs.adminId, adminId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await closeDatabaseConnection();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
