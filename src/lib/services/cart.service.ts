import Decimal from 'decimal.js';
import { and, asc, eq, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { cartItems, carts, products, productVariants } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { publicAvailableQty } from '@/lib/services/availability.service';
import type { AddCartItemInput } from '@/lib/validators/cart';

export type CartUnavailableReason = 'off_shelf' | 'out_of_stock' | null;

export interface CartItemView {
  id: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  skuCode: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  availableQty: number;
  isAvailable: boolean;
  unavailableReason: CartUnavailableReason;
}

export interface CartMutationResult {
  id: string;
  quantity: number;
  cartCount: number;
}

const scopedItem = (userId: string, itemId: string) => sql`
  ${cartItems.id} = ${itemId}
  AND EXISTS (
    SELECT 1 FROM ${carts}
    WHERE ${carts.id} = ${cartItems.cartId}
      AND ${carts.userId} = ${userId}
  )
`;

async function getPurchasableVariant(variantId: string) {
  const [variant] = await getDb()
    .select({
      id: productVariants.id,
      isActive: productVariants.isActive,
      productStatus: products.status,
      productDeletedAt: products.deletedAt,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (
    !variant ||
    !variant.isActive ||
    variant.productStatus !== 'on_sale' ||
    variant.productDeletedAt
  ) {
    throw new BizError('PRODUCT_UNAVAILABLE', '商品已下架或规格不可购买');
  }
  return variant;
}

function assertQuantityAvailable(quantity: number, availableQty: number): void {
  if (quantity > availableQty) {
    throw new BizError(
      'INSUFFICIENT_MATERIAL',
      `可售数量不足，当前最多可购买 ${availableQty} 件`,
      { availableQty },
    );
  }
}

async function getCartCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({
      count: sql<number>`COALESCE(SUM(${cartItems.quantity}), 0)::int`,
    })
    .from(carts)
    .leftJoin(cartItems, eq(cartItems.cartId, carts.id))
    .where(eq(carts.userId, userId));
  return row?.count ?? 0;
}

export async function listCartItems(userId: string): Promise<CartItemView[]> {
  const rows = await getDb()
    .select({
      id: cartItems.id,
      variantId: productVariants.id,
      productName: products.name,
      productSlug: products.slug,
      variantName: productVariants.name,
      skuCode: productVariants.skuCode,
      variantImageUrl: productVariants.imageUrl,
      productImageUrl: products.mainImageUrl,
      unitPrice: productVariants.price,
      quantity: cartItems.quantity,
      variantActive: productVariants.isActive,
      productStatus: products.status,
      productDeletedAt: products.deletedAt,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(carts.userId, userId))
    .orderBy(asc(cartItems.createdAt));

  return rows.map((row) => {
    const offShelf =
      !row.variantActive ||
      row.productStatus !== 'on_sale' ||
      Boolean(row.productDeletedAt);
    const quantityUnavailable = row.availableQty < row.quantity;
    const unavailableReason: CartUnavailableReason = offShelf
      ? 'off_shelf'
      : quantityUnavailable
        ? 'out_of_stock'
        : null;
    return {
      id: row.id,
      variantId: row.variantId,
      productName: row.productName,
      productSlug: row.productSlug,
      variantName: row.variantName,
      skuCode: row.skuCode,
      imageUrl: row.variantImageUrl ?? row.productImageUrl,
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      subtotal: new Decimal(row.unitPrice).mul(row.quantity).toFixed(2),
      availableQty: row.availableQty,
      isAvailable: unavailableReason === null,
      unavailableReason,
    };
  });
}

export async function addCartItem(
  userId: string,
  input: AddCartItemInput,
): Promise<CartMutationResult> {
  const variant = await getPurchasableVariant(input.variantId);
  assertQuantityAvailable(input.quantity, variant.availableQty);

  const result = await getDb().transaction(async (tx) => {
    await tx
      .insert(carts)
      .values({ userId })
      .onConflictDoNothing({ target: carts.userId });
    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);
    if (!cart) throw new BizError('INTERNAL_ERROR', '购物车创建失败');

    const [existing] = await tx
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.variantId, input.variantId),
        ),
      )
      .limit(1)
      .for('update');
    const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
    assertQuantityAvailable(nextQuantity, variant.availableQty);
    if (nextQuantity > 99) {
      throw new BizError('PARAM_INVALID', '单个商品最多可购买 99 件');
    }

    if (existing) {
      const [updated] = await tx
        .update(cartItems)
        .set({ quantity: nextQuantity, updatedAt: new Date() })
        .where(
          and(eq(cartItems.id, existing.id), eq(cartItems.cartId, cart.id)),
        )
        .returning({ id: cartItems.id, quantity: cartItems.quantity });
      return updated!;
    }

    const [created] = await tx
      .insert(cartItems)
      .values({
        cartId: cart.id,
        variantId: input.variantId,
        quantity: input.quantity,
      })
      .returning({ id: cartItems.id, quantity: cartItems.quantity });
    return created!;
  });
  return { ...result, cartCount: await getCartCount(userId) };
}

export async function updateCartItem(
  userId: string,
  itemId: string,
  quantity: number,
): Promise<CartMutationResult> {
  const [ownedItem] = await getDb()
    .select({
      variantId: cartItems.variantId,
      variantActive: productVariants.isActive,
      productStatus: products.status,
      productDeletedAt: products.deletedAt,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(cartItems.id, itemId), eq(carts.userId, userId)))
    .limit(1);
  if (!ownedItem) throw new BizError('NOT_FOUND', '购物车条目不存在');
  if (
    !ownedItem.variantActive ||
    ownedItem.productStatus !== 'on_sale' ||
    ownedItem.productDeletedAt
  ) {
    throw new BizError('PRODUCT_UNAVAILABLE', '商品已下架或规格不可购买');
  }
  assertQuantityAvailable(quantity, ownedItem.availableQty);
  const [updated] = await getDb()
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(scopedItem(userId, itemId))
    .returning({ id: cartItems.id, quantity: cartItems.quantity });
  if (!updated) throw new BizError('NOT_FOUND', '购物车条目不存在');
  return { ...updated, cartCount: await getCartCount(userId) };
}

export async function removeCartItem(
  userId: string,
  itemId: string,
): Promise<{ deleted: true; cartCount: number }> {
  const deleted = await getDb()
    .delete(cartItems)
    .where(scopedItem(userId, itemId))
    .returning({ id: cartItems.id });
  if (deleted.length === 0) throw new BizError('NOT_FOUND', '购物车条目不存在');
  return { deleted: true, cartCount: await getCartCount(userId) };
}
