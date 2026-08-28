import { z } from 'zod';

const nullableUrl = z
  .string()
  .trim()
  .url('图片地址格式不正确')
  .max(2000)
  .nullable()
  .optional();

const categoryFields = {
  name: z.string().trim().min(1, '分类名称不能为空').max(50),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug 不能为空')
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug 只能包含小写字母、数字和单个连字符',
    ),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: nullableUrl,
  sortOrder: z.number().int().min(-999999).max(999999).default(0),
  isVisible: z.boolean().default(true),
};

export const createCategorySchema = z.object(categoryFields).strict();

export const updateCategorySchema = z
  .object(categoryFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const categoryIdSchema = z.string().uuid();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
