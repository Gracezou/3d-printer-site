import { z } from 'zod';

const orderItemSchema = z
  .object({
    variantId: z.string().uuid('商品规格无效'),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();

export const orderPreviewSchema = z
  .object({
    items: z.array(orderItemSchema).min(1, '至少选择一件商品').max(50),
    addressId: z.string().uuid('收货地址无效').nullable().optional(),
    discountCode: z.string().trim().min(1).max(32).nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();
    input.items.forEach((item, index) => {
      if (seen.has(item.variantId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '同一商品规格不能重复提交',
          path: ['items', index, 'variantId'],
        });
      }
      seen.add(item.variantId);
    });
  });

export type OrderPreviewInput = z.infer<typeof orderPreviewSchema>;
