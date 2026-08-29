import Decimal from 'decimal.js';
import { z } from 'zod';

const decimal = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, `${label}格式不正确`)
    .refine((value) => new Decimal(value).gte(0), `${label}不能为负数`);

const nullableDecimal = (label: string) =>
  z.union([decimal(label), z.null()]).optional();

export const promotionTypes = [
  'fixed_amount',
  'percentage',
  'free_shipping',
] as const;
export const promotionScopes = ['all', 'category', 'product'] as const;

const promotionFields = {
  name: z.string().trim().min(1, '规则名称不能为空').max(100),
  discountType: z.enum(promotionTypes),
  discountValue: decimal('优惠值'),
  minOrderAmount: decimal('使用门槛'),
  maxDiscountAmount: nullableDecimal('封顶金额'),
  scope: z.enum(promotionScopes),
  scopeIds: z.array(z.string().uuid('适用范围 ID 无效')).max(500),
  isActive: z.boolean(),
};

function validatePromotion(
  input: {
    discountType?: (typeof promotionTypes)[number];
    discountValue?: string;
    maxDiscountAmount?: string | null;
    scope?: (typeof promotionScopes)[number];
    scopeIds?: string[];
  },
  context: z.RefinementCtx,
): void {
  if (input.discountType === 'fixed_amount' && input.discountValue) {
    if (new Decimal(input.discountValue).lte(0)) {
      context.addIssue({
        code: 'custom',
        message: '满减金额必须大于 0',
        path: ['discountValue'],
      });
    }
    if (input.maxDiscountAmount) {
      context.addIssue({
        code: 'custom',
        message: '满减规则不需要封顶金额',
        path: ['maxDiscountAmount'],
      });
    }
  }
  if (input.discountType === 'percentage' && input.discountValue) {
    const value = new Decimal(input.discountValue);
    if (value.lte(0) || value.gte(1)) {
      context.addIssue({
        code: 'custom',
        message: '折扣率必须大于 0 且小于 1，例如九折填写 0.9',
        path: ['discountValue'],
      });
    }
  }
  if (input.discountType === 'free_shipping') {
    if (input.discountValue && !new Decimal(input.discountValue).isZero()) {
      context.addIssue({
        code: 'custom',
        message: '包邮规则的优惠值必须为 0',
        path: ['discountValue'],
      });
    }
    if (input.maxDiscountAmount) {
      context.addIssue({
        code: 'custom',
        message: '包邮规则不需要封顶金额',
        path: ['maxDiscountAmount'],
      });
    }
  }
  if (input.scope === 'all' && input.scopeIds?.length) {
    context.addIssue({
      code: 'custom',
      message: '全场规则不应填写范围 ID',
      path: ['scopeIds'],
    });
  }
  if (input.scope && input.scope !== 'all' && !input.scopeIds?.length) {
    context.addIssue({
      code: 'custom',
      message: '指定范围时至少填写一个 ID',
      path: ['scopeIds'],
    });
  }
  if (
    input.scopeIds &&
    new Set(input.scopeIds).size !== input.scopeIds.length
  ) {
    context.addIssue({
      code: 'custom',
      message: '适用范围 ID 不能重复',
      path: ['scopeIds'],
    });
  }
}

export const createPromotionSchema = z
  .object(promotionFields)
  .strict()
  .superRefine(validatePromotion);

export const updatePromotionSchema = z
  .object(promotionFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const promotionListQuerySchema = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    discountType: z.enum(promotionTypes).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const promotionIdSchema = z.string().uuid('优惠规则 ID 无效');

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>;
