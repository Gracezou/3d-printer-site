import Decimal from 'decimal.js';
import { z } from 'zod';

const decimal = (scale: number, label: string) =>
  z
    .string()
    .regex(new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`), `${label}格式不正确`)
    .refine((value) => new Decimal(value).isFinite(), `${label}格式不正确`);

const nonNegativeDecimal = (scale: number, label: string) =>
  decimal(scale, label).refine(
    (value) => new Decimal(value).gte(0),
    `${label}不能为负数`,
  );

const positiveDecimal = (scale: number, label: string) =>
  decimal(scale, label).refine(
    (value) => new Decimal(value).gt(0),
    `${label}必须大于 0`,
  );

export const materialTypes = [
  'PLA',
  'PETG',
  'ABS',
  'TPU',
  'ASA',
  'PA',
  'RESIN',
  'OTHER',
] as const;

export const movementTypes = [
  'purchase_in',
  'manual_in',
  'manual_out',
  'adjust',
  'reserve',
  'reserve_release',
  'consume',
  'reprint_loss',
  'refund_return',
] as const;

const materialFields = {
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  materialType: z.enum(materialTypes),
  colorName: z.string().trim().max(50).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, '色值必须为 #RRGGBB 格式')
    .nullable()
    .optional(),
  brand: z.string().trim().max(50).nullable().optional(),
  spec: z.string().trim().max(50).nullable().optional(),
  unitCostPerKg: nonNegativeDecimal(2, '每公斤成本'),
  safetyGrams: nonNegativeDecimal(2, '安全库存'),
  wasteRate: nonNegativeDecimal(4, '损耗率').refine(
    (value) => new Decimal(value).lt(1),
    '损耗率必须小于 1',
  ),
  supplier: z.string().trim().max(100).nullable().optional(),
  remark: z.string().trim().max(2000).nullable().optional(),
};

export const createMaterialSchema = z.object(materialFields).strict();

export const updateMaterialSchema = z
  .object(materialFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, '至少需要修改一个字段');

export const stockInSchema = z
  .object({
    grams: positiveDecimal(2, '入库克数'),
    unitCostPerKg: nonNegativeDecimal(2, '每公斤成本'),
    batchNo: z.string().trim().max(64).nullable().optional(),
    remark: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const adjustMaterialSchema = z
  .object({
    targetGrams: nonNegativeDecimal(2, '调整后库存'),
    remark: z.string().trim().min(1, '必须填写调整原因').max(2000),
  })
  .strict();

export const toggleMaterialSchema = z
  .object({ isActive: z.boolean() })
  .strict();

export const materialListQuerySchema = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    type: z.enum(materialTypes).optional(),
    lowStockOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const movementListQuerySchema = z
  .object({
    type: z.enum(movementTypes).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const materialIdSchema = z.string().uuid();

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type AdjustMaterialInput = z.infer<typeof adjustMaterialSchema>;
export type MaterialListQuery = z.infer<typeof materialListQuerySchema>;
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
