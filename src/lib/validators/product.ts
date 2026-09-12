import Decimal from 'decimal.js';
import { z } from 'zod';

const nonNegativeDecimal = (scale: number, label: string) =>
  z
    .string()
    .regex(new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`), `${label}格式不正确`)
    .refine((value) => new Decimal(value).gte(0), `${label}不能为负数`);

const positiveDecimal = (scale: number, label: string) =>
  nonNegativeDecimal(scale, label).refine(
    (value) => new Decimal(value).gt(0),
    `${label}必须大于 0`,
  );

const nullableUrl = z
  .string()
  .trim()
  .url('文件地址格式不正确')
  .max(2000)
  .nullable()
  .optional();

const productFields = {
  categoryId: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, '商品名称不能为空')
    .max(120)
    .refine(
      (value) => !/(?:官方|原装|授权)/u.test(value),
      '商品名称不得暗示第三方官方出品、原装或授权',
    ),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug 不能为空')
    .max(150)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug 只能包含小写字母、数字和单个连字符',
    ),
  subtitle: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(100000).nullable().optional(),
  mainImageUrl: nullableUrl,
  gallery: z.array(z.string().url().max(2000)).max(30).default([]),
  modelPreviewUrl: nullableUrl,
  specs: z.record(z.string().max(100), z.string().max(500)).default({}),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(-999999).max(999999).default(0),
};

export const createProductSchema = z.object(productFields).strict();

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const productStatuses = ['draft', 'on_sale', 'off_shelf'] as const;

export const productStatusSchema = z
  .object({ status: z.enum(productStatuses) })
  .strict();

export const productListQuerySchema = z
  .object({
    keyword: z.string().trim().max(150).optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(productStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const bomItemSchema = z
  .object({
    materialId: z.string().uuid(),
    grams: positiveDecimal(2, 'BOM 克数'),
  })
  .strict();

const variantSchema = z
  .object({
    id: z.string().uuid().nullable(),
    skuCode: z.string().trim().min(1, 'SKU 编码不能为空').max(64),
    name: z.string().trim().min(1, '变体名称不能为空').max(150),
    attributes: z.record(z.string().max(50), z.string().max(100)).default({}),
    price: nonNegativeDecimal(2, '销售价'),
    comparePrice: nonNegativeDecimal(2, '划线价').nullable().optional(),
    weightGrams: nonNegativeDecimal(2, '成品重量').default('0'),
    printHours: nonNegativeDecimal(2, '打印工时').nullable().optional(),
    imageUrl: nullableUrl,
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(-999999).max(999999).optional(),
    bom: z
      .array(bomItemSchema)
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((item) => item.materialId)).size === items.length,
        '同一变体不能重复添加相同耗材',
      ),
  })
  .strict();

export const replaceVariantsSchema = z
  .object({ variants: z.array(variantSchema).max(200) })
  .strict()
  .superRefine(({ variants }, context) => {
    const ids = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: '变体 ID 不能重复' });
    }
    const skuCodes = variants.map((variant) => variant.skuCode);
    if (new Set(skuCodes).size !== skuCodes.length) {
      context.addIssue({ code: 'custom', message: 'SKU 编码不能重复' });
    }
  });

export const productIdSchema = z.string().uuid();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductStatus = (typeof productStatuses)[number];
export type ReplaceVariantsInput = z.infer<typeof replaceVariantsSchema>;
