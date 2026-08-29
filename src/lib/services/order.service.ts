import Decimal from 'decimal.js';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import {
  addresses,
  cartItems,
  carts,
  materials,
  orderItems,
  orders,
  products,
  productVariants,
  settings,
  variantMaterials,
  type BomSnapshotItem,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import {
  applyDiscountCode,
  calculateOrderAmounts,
  recordDiscountRedemption,
} from '@/lib/services/promotion.service';
import { calculateShipping } from '@/lib/services/shipping.service';
import type { CreateOrderInput } from '@/lib/validators/order';

interface CreatedOrder {
  orderNo: string;
  payableAmount: string;
  reservedUntil: Date;
}

function databaseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '';
  const cause = error.cause instanceof Error ? error.cause.message : '';
  return `${error.message}\n${cause}`;
}

function translateInventoryError(error: unknown): never {
  if (error instanceof BizError) throw error;
  const message = databaseErrorMessage(error);
  const insufficient = message.match(/INSUFFICIENT_MATERIAL:([^\n]+)/);
  if (insufficient) {
    throw new BizError(
      'INSUFFICIENT_MATERIAL',
      `${insufficient[1]?.trim() || '耗材'} 库存不足`,
    );
  }
  const inactive = message.match(/MATERIAL_INACTIVE:([^\n]+)/);
  if (inactive) {
    throw new BizError(
      'MATERIAL_INACTIVE',
      `${inactive[1]?.trim() || '耗材'} 已停用`,
    );
  }
  const missing = message.match(/MATERIAL_NOT_FOUND:([^\n]+)/);
  if (missing) {
    throw new BizError('NOT_FOUND', '商品关联的耗材不存在');
  }
  throw error;
}

function getOrderTimeoutMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, 24 * 60)
    : 30;
}

export async function createOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  try {
    const created = await getDb().transaction(async (tx) => {
      const variantIds = input.items.map((item) => item.variantId);

      // 1. 商品与变体状态校验。
      const variantRows = await tx
        .select({
          variantId: productVariants.id,
          productId: products.id,
          productName: products.name,
          variantName: productVariants.name,
          skuCode: productVariants.skuCode,
          variantImageUrl: productVariants.imageUrl,
          productImageUrl: products.mainImageUrl,
          price: productVariants.price,
          weightGrams: productVariants.weightGrams,
          variantActive: productVariants.isActive,
          productStatus: products.status,
          productDeletedAt: products.deletedAt,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(productVariants.id, variantIds));
      const variantsById = new Map(
        variantRows.map((row) => [row.variantId, row]),
      );
      for (const item of input.items) {
        const row = variantsById.get(item.variantId);
        if (
          !row ||
          !row.variantActive ||
          row.productStatus !== 'on_sale' ||
          row.productDeletedAt
        ) {
          throw new BizError('PRODUCT_UNAVAILABLE', '商品已下架或规格不可购买');
        }
      }

      // 2. 只使用数据库价格计算商品小计与重量。
      let itemsAmount = new Decimal(0);
      let totalWeight = new Decimal(0);
      for (const item of input.items) {
        const row = variantsById.get(item.variantId)!;
        itemsAmount = itemsAmount.add(
          new Decimal(row.price).mul(item.quantity),
        );
        totalWeight = totalWeight.add(
          new Decimal(row.weightGrams).mul(item.quantity),
        );
      }

      // 3. 地址查询直接限定当前用户。
      const [address] = await tx
        .select({
          receiverName: addresses.receiverName,
          receiverPhone: addresses.receiverPhone,
          province: addresses.province,
          provinceCode: addresses.provinceCode,
          city: addresses.city,
          district: addresses.district,
          detail: addresses.detail,
        })
        .from(addresses)
        .where(
          and(
            eq(addresses.id, input.addressId),
            eq(addresses.userId, userId),
            isNull(addresses.deletedAt),
          ),
        )
        .limit(1);
      if (!address) {
        throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');
      }

      // 4. 计算运费。
      const shipping = await calculateShipping(
        address.provinceCode,
        totalWeight,
        itemsAmount,
        tx,
      );

      // 5. 原子占用折扣码。
      const discount = input.discountCode
        ? await applyDiscountCode(tx, input.discountCode, userId, itemsAmount)
        : undefined;

      // 6. 计算应付金额。
      const amounts = calculateOrderAmounts(
        itemsAmount,
        shipping.amount,
        discount,
      );

      // 7. 生成订单号并创建订单。
      const orderNumberRows = await tx.execute<{ order_no: string }>(
        sql`SELECT fn_generate_order_no() AS order_no`,
      );
      const orderNo = orderNumberRows[0]?.order_no;
      if (!orderNo) throw new BizError('INTERNAL_ERROR', '订单号生成失败');
      const [timeoutSetting] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, 'order_timeout_minutes'))
        .limit(1);
      const reservedUntil = new Date(
        Date.now() + getOrderTimeoutMinutes(timeoutSetting?.value) * 60_000,
      );
      const [order] = await tx
        .insert(orders)
        .values({
          orderNo,
          userId,
          itemsAmount: amounts.itemsAmount,
          discountAmount: amounts.discountAmount,
          shippingAmount: amounts.shippingAmount,
          payableAmount: amounts.payableAmount,
          discountCodeId: discount?.codeId,
          discountCode: discount?.code,
          receiverName: address.receiverName,
          receiverPhone: address.receiverPhone,
          receiverProvince: address.province,
          receiverCity: address.city,
          receiverDistrict: address.district,
          receiverDetail: address.detail,
          buyerRemark: input.buyerRemark || null,
          reservedUntil,
        })
        .returning({ id: orders.id });
      if (!order) throw new BizError('INTERNAL_ERROR', '订单创建失败');

      // 8. 订单项写入不可变 BOM 快照。
      const bomRows = await tx
        .select({
          variantId: variantMaterials.variantId,
          materialId: materials.id,
          materialName: materials.name,
          grams: variantMaterials.grams,
          wasteRate: materials.wasteRate,
        })
        .from(variantMaterials)
        .innerJoin(materials, eq(materials.id, variantMaterials.materialId))
        .where(inArray(variantMaterials.variantId, variantIds))
        .orderBy(asc(materials.id));
      const bomByVariant = new Map<string, BomSnapshotItem[]>();
      for (const bom of bomRows) {
        const snapshot = bomByVariant.get(bom.variantId) ?? [];
        snapshot.push({
          material_id: bom.materialId,
          material_name: bom.materialName,
          grams: bom.grams,
          waste_rate: bom.wasteRate,
          required_grams: new Decimal(bom.grams)
            .mul(new Decimal(1).add(bom.wasteRate))
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
            .toString(),
        });
        bomByVariant.set(bom.variantId, snapshot);
      }
      for (const item of input.items) {
        if ((bomByVariant.get(item.variantId)?.length ?? 0) === 0) {
          throw new BizError('VARIANT_NO_BOM', '商品规格尚未配置耗材 BOM');
        }
      }
      await tx.insert(orderItems).values(
        input.items.map((item) => {
          const row = variantsById.get(item.variantId)!;
          return {
            orderId: order.id,
            productId: row.productId,
            variantId: row.variantId,
            productName: row.productName,
            variantName: row.variantName,
            skuCode: row.skuCode,
            imageUrl: row.variantImageUrl ?? row.productImageUrl,
            unitPrice: row.price,
            quantity: item.quantity,
            subtotal: toFixed2(new Decimal(row.price).mul(item.quantity)),
            bomSnapshot: bomByVariant.get(item.variantId)!,
          };
        }),
      );

      // 9. BOM 快照落库后再执行耗材预扣。
      await tx.execute(sql`SELECT fn_reserve_order_stock(${order.id}::uuid)`);

      // 10. 折扣核销记录与占用计数处于同一事务。
      if (discount) {
        await recordDiscountRedemption(tx, order.id, userId, discount);
      }

      // 11. 仅清除当前用户购物车内本次下单的规格。
      if (input.fromCart) {
        await tx.delete(cartItems).where(sql`
          ${cartItems.variantId} IN (${sql.join(
            variantIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          AND EXISTS (
            SELECT 1 FROM ${carts}
            WHERE ${carts.id} = ${cartItems.cartId}
              AND ${carts.userId} = ${userId}
          )
        `);
        await tx
          .update(carts)
          .set({ updatedAt: new Date() })
          .where(eq(carts.userId, userId));
      }

      return {
        orderId: order.id,
        orderNo,
        payableAmount: amounts.payableAmount,
        reservedUntil,
      };
    });
    logger.info(
      { orderId: created.orderId, orderNo: created.orderNo, userId },
      'Order created',
    );
    return {
      orderNo: created.orderNo,
      payableAmount: created.payableAmount,
      reservedUntil: created.reservedUntil,
    };
  } catch (error: unknown) {
    translateInventoryError(error);
  }
}
