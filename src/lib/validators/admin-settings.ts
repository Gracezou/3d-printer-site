import Decimal from 'decimal.js';
import { z } from 'zod';

const safeLinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value.startsWith('/') ||
      value.startsWith('https://') ||
      value.startsWith('http://'),
    '链接必须是站内路径或 HTTP(S) 地址',
  );

const imageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (value) => value.startsWith('/') || value.startsWith('https://'),
    '图片必须是站内路径或 HTTPS 地址',
  )
  .nullable();

export const siteBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    subtitle: z.string().trim().max(300).default(''),
    imageUrl: imageUrlSchema.default(null),
    linkUrl: safeLinkSchema.default('/products'),
    buttonText: z.string().trim().min(1).max(30).default('查看详情'),
  })
  .strict();

export const siteInfoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(300),
    contact: z.string().trim().max(200),
    about: z.string().trim().max(1000),
  })
  .strict();

export const updateSiteSettingsSchema = z
  .object({
    siteBanners: z.array(siteBannerSchema).max(10),
    siteInfo: siteInfoSchema,
  })
  .strict();

const decimalSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, '金额或重量最多保留两位小数');
const positiveDecimalSchema = decimalSchema.refine(
  (value) => new Decimal(value).greaterThan(0),
  '数值必须大于 0',
);

export const shippingRuleSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(50),
    provinceCodes: z
      .array(z.string().regex(/^\d{6}$/, '省份编码必须为 6 位数字'))
      .max(40)
      .transform((values) => [...new Set(values)]),
    firstWeightGrams: positiveDecimalSchema,
    firstAmount: decimalSchema,
    additionalWeightGrams: positiveDecimalSchema,
    additionalAmount: decimalSchema,
    freeThreshold: positiveDecimalSchema.nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(-10000).max(10000),
  })
  .strict();

export const updateShippingRulesSchema = z
  .object({ rules: z.array(shippingRuleSchema).min(1).max(100) })
  .strict()
  .superRefine(({ rules }, context) => {
    const activeFallbacks = rules.filter(
      (rule) => rule.isActive && rule.provinceCodes.length === 0,
    );
    if (activeFallbacks.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['rules'],
        message: '必须且只能配置一条启用的全国兜底规则',
      });
    }
  });

export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;
export type UpdateShippingRulesInput = z.infer<
  typeof updateShippingRulesSchema
>;
