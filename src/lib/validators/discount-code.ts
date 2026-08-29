import { z } from 'zod';

export const discountCodeTypes = ['permanent', 'limited'] as const;
export const discountCodeStatuses = [
  'active',
  'disabled',
  'not_started',
  'expired',
  'exhausted',
] as const;

const dateTime = z.union([
  z
    .string()
    .datetime({ offset: true, message: '时间必须包含时区' })
    .transform((value) => new Date(value)),
  z.date(),
]);

const nullableDateTime = z.union([dateTime, z.null()]);

const fields = {
  promotionId: z.string().uuid('优惠规则 ID 无效'),
  code: z
    .string()
    .trim()
    .min(1, '折扣码不能为空')
    .max(32)
    .transform((value) => value.toUpperCase()),
  codeType: z.enum(discountCodeTypes),
  maxUses: z.number().int().positive('总次数必须大于 0').nullable(),
  perUserLimit: z.number().int().positive('单用户限次必须大于 0').default(1),
  startsAt: dateTime,
  endsAt: nullableDateTime,
  isActive: z.boolean().default(true),
  remark: z.string().trim().max(2000).nullable().default(null),
};

function validateCode(
  input: {
    codeType?: (typeof discountCodeTypes)[number];
    maxUses?: number | null;
    startsAt?: Date;
    endsAt?: Date | null;
  },
  context: z.RefinementCtx,
): void {
  if (input.codeType === 'permanent' && input.maxUses !== null) {
    context.addIssue({
      code: 'custom',
      message: '常驻码的总次数必须为空',
      path: ['maxUses'],
    });
  }
  if (input.codeType === 'limited' && !input.maxUses) {
    context.addIssue({
      code: 'custom',
      message: '限次码必须填写总次数',
      path: ['maxUses'],
    });
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    context.addIssue({
      code: 'custom',
      message: '失效时间必须晚于生效时间',
      path: ['endsAt'],
    });
  }
}

export const createDiscountCodeSchema = z
  .object(fields)
  .strict()
  .superRefine(validateCode);

export const updateDiscountCodeSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const discountCodeListQuerySchema = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    promotionId: z.string().uuid('优惠规则 ID 无效').optional(),
    codeType: z.enum(discountCodeTypes).optional(),
    status: z.enum(discountCodeStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const discountCodeIdSchema = z.string().uuid('折扣码 ID 无效');

export const toggleDiscountCodeSchema = z
  .object({ isActive: z.boolean() })
  .strict();

export const redemptionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateDiscountCodeInput = z.infer<typeof createDiscountCodeSchema>;
export type UpdateDiscountCodeInput = z.infer<typeof updateDiscountCodeSchema>;
export type DiscountCodeListQuery = z.infer<typeof discountCodeListQuerySchema>;
export type RedemptionListQuery = z.infer<typeof redemptionListQuerySchema>;
