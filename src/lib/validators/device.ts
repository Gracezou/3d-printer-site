import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug 不能为空')
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug 只能包含小写字母、数字和单个连字符',
  );

const aliasesSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .default([])
  .transform((values) => [...new Set(values)]);

const dimensionsSchema = z
  .object({
    widthMm: z.number().positive().max(1000).optional(),
    heightMm: z.number().positive().max(1000).optional(),
    thicknessMm: z.number().positive().max(100).optional(),
    weightGrams: z.number().positive().max(5000).optional(),
  })
  .strict()
  .default({});

const brandFields = {
  name: z.string().trim().min(1, '品牌名称不能为空').max(50),
  slug: slugSchema.max(50),
  aliases: aliasesSchema,
  sortOrder: z.number().int().min(-999999).max(999999).default(0),
  isVisible: z.boolean().default(true),
};

export const createDeviceBrandSchema = z.object(brandFields).strict();
export const updateDeviceBrandSchema = z
  .object(brandFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

const modelFields = {
  brandId: z.string().uuid(),
  name: z.string().trim().min(1, '机型名称不能为空').max(80),
  slug: slugSchema,
  aliases: aliasesSchema,
  releaseYear: z.number().int().min(2000).max(2100).nullable().default(null),
  isDiscontinued: z.boolean().default(false),
  isMolded: z.boolean().default(false),
  dimensions: dimensionsSchema,
  compatGroup: z.string().trim().max(50).nullable().default(null),
  notes: z.string().trim().max(4000).nullable().default(null),
  sortOrder: z.number().int().min(-999999).max(999999).default(0),
  isVisible: z.boolean().default(true),
  productIds: z.array(z.string().uuid()).max(100).default([]),
};

export const createDeviceModelSchema = z.object(modelFields).strict();
export const updateDeviceModelSchema = z
  .object(modelFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const deviceIdSchema = z.string().uuid();
export const devicePathSchema = z.object({
  brand: slugSchema.max(50),
  model: slugSchema,
});
export const deviceSearchSchema = z.object({
  q: z.string().trim().min(1, '请输入品牌或型号').max(80),
});
export const modelRequestSchema = z
  .object({
    deviceModelId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(255),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export type CreateDeviceBrandInput = z.infer<typeof createDeviceBrandSchema>;
export type UpdateDeviceBrandInput = z.infer<typeof updateDeviceBrandSchema>;
export type CreateDeviceModelInput = z.infer<typeof createDeviceModelSchema>;
export type UpdateDeviceModelInput = z.infer<typeof updateDeviceModelSchema>;
export type ModelRequestInput = z.infer<typeof modelRequestSchema>;
