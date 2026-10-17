import Decimal from 'decimal.js';
import { z } from 'zod';

const amount = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, '请输入最多两位小数的非负数');
const grams = amount.refine(
  (value) => new Decimal(value).gt(0),
  '耗材用量必须大于 0',
);
const image = z
  .string()
  .trim()
  .url('图片地址格式不正确')
  .max(2000)
  .nullable()
  .default(null);
export const colorwaySchema = z
  .object({
    id: z.string().uuid().nullable().default(null),
    name: z.string().trim().min(1, '请填写配色名称').max(100),
    imageUrl: image,
    bom: z
      .array(z.object({ materialId: z.string().uuid(), grams }).strict())
      .min(1, '配色至少需要一种耗材')
      .max(20),
  })
  .strict();
export const productStyleSchema = z
  .object({
    id: z.string().uuid().nullable().default(null),
    name: z.string().trim().min(1, '请填写款式名称').max(80),
    price: amount,
    weightGrams: amount,
    materialGrams: grams,
    printHours: amount
      .refine(
        (value) => new Decimal(value).lt(10000),
        '打印工时不能达到 10000 小时',
      )
      .nullable()
      .default(null),
    imageUrl: image,
    singleMaterialMode: z.enum(['none', 'selected', 'all']).default('none'),
    materialIds: z.array(z.string().uuid()).max(2000).default([]),
    singleImages: z
      .array(
        z.object({ materialId: z.string().uuid(), imageUrl: image }).strict(),
      )
      .max(2000)
      .default([]),
    colorways: z.array(colorwaySchema).max(200).default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine((style, ctx) => {
    if (
      style.isActive &&
      style.singleMaterialMode === 'none' &&
      !style.colorways.length
    )
      ctx.addIssue({
        code: 'custom',
        message: '启用款式至少配置一种单色或预设配色',
      });
    if (style.singleMaterialMode === 'selected' && !style.materialIds.length)
      ctx.addIssue({ code: 'custom', message: '请选择单色耗材' });
    if (
      new Set(style.colorways.map((item) => item.name)).size !==
      style.colorways.length
    )
      ctx.addIssue({ code: 'custom', message: '同一款式配色名称不能重复' });
    if (
      new Set(style.singleImages.map((item) => item.materialId)).size !==
      style.singleImages.length
    )
      ctx.addIssue({ code: 'custom', message: '同一单色不能重复配置图片' });
  });
export const replaceProductStylesSchema = z
  .object({ styles: z.array(productStyleSchema).max(30) })
  .strict()
  .superRefine(({ styles }, ctx) => {
    if (new Set(styles.map((style) => style.name)).size !== styles.length)
      ctx.addIssue({ code: 'custom', message: '款式名称不能重复' });
    const ids = styles.flatMap((style) => (style.id ? [style.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: '款式不能重复' });
    const variantIds = styles.flatMap((style) =>
      style.colorways.flatMap((color) => (color.id ? [color.id] : [])),
    );
    if (new Set(variantIds).size !== variantIds.length)
      ctx.addIssue({ code: 'custom', message: '配色不能重复引用同一 SKU' });
  });
export type ProductStyleInput = z.infer<typeof productStyleSchema>;
export type ReplaceProductStylesInput = z.infer<
  typeof replaceProductStylesSchema
>;
