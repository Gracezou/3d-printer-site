import { z } from 'zod';

export const addCartItemSchema = z.object({
  variantId: z.string().uuid('商品规格无效'),
  quantity: z.number().int().min(1).max(99),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

export const cartItemIdSchema = z.string().uuid('购物车条目无效');

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
