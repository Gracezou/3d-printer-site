import Decimal from 'decimal.js';
import { z } from 'zod';

export const storefrontSorts = [
  'default',
  'price_asc',
  'price_desc',
  'newest',
] as const;

export const storefrontMaterialTypes = [
  'PLA',
  'PETG',
  'ABS',
  'TPU',
  'ASA',
  'PA',
  'RESIN',
  'OTHER',
] as const;

export type StorefrontMaterialType = (typeof storefrontMaterialTypes)[number];

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value : undefined),
    z.string().trim().max(max).optional(),
  );

const optionalPrice = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/, '价格格式不正确')
    .refine((value) => new Decimal(value).gte(0), '价格不能为负数')
    .optional(),
);

const optionalMaterialType = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.enum(storefrontMaterialTypes).optional(),
);

export const storefrontProductListQuerySchema = z
  .object({
    keyword: optionalText(150),
    categoryId: optionalText(36).pipe(z.string().uuid().optional()),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    materialType: optionalMaterialType,
    sort: z.enum(storefrontSorts).default('default'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict()
  .refine(
    ({ minPrice, maxPrice }) =>
      !minPrice || !maxPrice || new Decimal(minPrice).lte(maxPrice),
    { message: '最低价不能高于最高价', path: ['minPrice'] },
  );

export type StorefrontProductListQuery = z.infer<
  typeof storefrontProductListQuerySchema
>;
