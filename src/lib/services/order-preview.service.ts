import Decimal from 'decimal.js';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { addresses, products, productVariants } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  calculateOrderAmounts,
  previewDiscountCode,
} from '@/lib/services/promotion.service';
import { publicAvailableQty } from '@/lib/services/availability.service';
import { calculateShipping } from '@/lib/services/shipping.service';
import type { OrderPreviewInput } from '@/lib/validators/order';

export type UnavailableReason = 'not_found' | 'off_shelf' | 'out_of_stock';

export interface UnavailableOrderItem {
  variantId: string;
  requestedQty: number;
  availableQty: number;
  reason: UnavailableReason;
}

export interface OrderPreview {
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  payableAmount: string;
  discount: {
    code: string;
    name: string;
    type: string;
  } | null;
  unavailableItems: UnavailableOrderItem[];
}

export async function previewOrder(
  userId: string,
  input: OrderPreviewInput,
): Promise<OrderPreview> {
  const variantIds = input.items.map((item) => item.variantId);
  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      price: productVariants.price,
      weightGrams: productVariants.weightGrams,
      variantActive: productVariants.isActive,
      productStatus: products.status,
      productDeletedAt: products.deletedAt,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  const rowsById = new Map(rows.map((row) => [row.variantId, row]));
  let itemsAmount = new Decimal(0);
  let totalWeight = new Decimal(0);
  const unavailableItems: UnavailableOrderItem[] = [];

  for (const item of input.items) {
    const row = rowsById.get(item.variantId);
    if (!row) {
      unavailableItems.push({
        variantId: item.variantId,
        requestedQty: item.quantity,
        availableQty: 0,
        reason: 'not_found',
      });
      continue;
    }
    itemsAmount = itemsAmount.add(new Decimal(row.price).mul(item.quantity));
    totalWeight = totalWeight.add(
      new Decimal(row.weightGrams).mul(item.quantity),
    );
    const offShelf =
      !row.variantActive ||
      row.productStatus !== 'on_sale' ||
      Boolean(row.productDeletedAt);
    if (offShelf || row.availableQty < item.quantity) {
      unavailableItems.push({
        variantId: item.variantId,
        requestedQty: item.quantity,
        availableQty: row.availableQty,
        reason: offShelf ? 'off_shelf' : 'out_of_stock',
      });
    }
  }

  let shippingAmount = new Decimal(0);
  if (input.addressId) {
    const [address] = await getDb()
      .select({ provinceCode: addresses.provinceCode })
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
    const shipping = await calculateShipping(
      address.provinceCode,
      totalWeight,
      itemsAmount,
    );
    shippingAmount = new Decimal(shipping.amount);
  }

  const discount = input.discountCode
    ? await previewDiscountCode(input.discountCode, userId, itemsAmount)
    : undefined;
  const amounts = calculateOrderAmounts(itemsAmount, shippingAmount, discount);
  return {
    ...amounts,
    discount: discount
      ? { code: discount.code, name: discount.name, type: discount.type }
      : null,
    unavailableItems,
  };
}
