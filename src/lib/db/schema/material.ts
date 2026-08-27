import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { productVariants } from './product';

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    materialType: varchar('material_type', { length: 30 }).notNull(),
    colorName: varchar('color_name', { length: 50 }),
    colorHex: varchar('color_hex', { length: 7 }),
    brand: varchar('brand', { length: 50 }),
    spec: varchar('spec', { length: 50 }),
    unitCostPerKg: numeric('unit_cost_per_kg', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    stockGrams: numeric('stock_grams', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    reservedGrams: numeric('reserved_grams', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    safetyGrams: numeric('safety_grams', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    wasteRate: numeric('waste_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.0500'),
    isActive: boolean('is_active').notNull().default(true),
    supplier: varchar('supplier', { length: 100 }),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'materials_material_type_check',
      sql`${table.materialType} IN ('PLA','PETG','ABS','TPU','ASA','PA','RESIN','OTHER')`,
    ),
    check('materials_reserved_grams_check', sql`${table.reservedGrams} >= 0`),
    check('materials_safety_grams_check', sql`${table.safetyGrams} >= 0`),
    check(
      'materials_waste_rate_check',
      sql`${table.wasteRate} >= 0 AND ${table.wasteRate} < 1`,
    ),
    index('idx_materials_active').on(table.isActive, table.materialType),
  ],
);

export const variantMaterials = pgTable(
  'variant_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    grams: numeric('grams', { precision: 10, scale: 2 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('variant_materials_grams_check', sql`${table.grams} > 0`),
    unique('variant_materials_variant_id_material_id_unique').on(
      table.variantId,
      table.materialId,
    ),
    index('idx_vm_material').on(table.materialId),
  ],
);

export const materialStockMovements = pgTable(
  'material_stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    movementType: varchar('movement_type', { length: 30 }).notNull(),
    deltaStockGrams: numeric('delta_stock_grams', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    deltaReservedGrams: numeric('delta_reserved_grams', {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default('0'),
    stockAfter: numeric('stock_after', { precision: 12, scale: 2 }).notNull(),
    reservedAfter: numeric('reserved_after', {
      precision: 12,
      scale: 2,
    }).notNull(),
    refType: varchar('ref_type', { length: 30 }),
    refId: varchar('ref_id', { length: 64 }),
    batchNo: varchar('batch_no', { length: 64 }),
    unitCostPerKg: numeric('unit_cost_per_kg', { precision: 10, scale: 2 }),
    operatorType: varchar('operator_type', { length: 20 })
      .notNull()
      .default('system'),
    operatorId: uuid('operator_id'),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'material_stock_movements_movement_type_check',
      sql`${table.movementType} IN ('purchase_in','manual_in','manual_out','adjust','reserve','reserve_release','consume','reprint_loss','refund_return')`,
    ),
    check(
      'material_stock_movements_operator_type_check',
      sql`${table.operatorType} IN ('system','admin')`,
    ),
    index('idx_movements_material').on(
      table.materialId,
      table.createdAt.desc(),
    ),
    index('idx_movements_ref').on(table.refType, table.refId),
    uniqueIndex('uq_movements_order_once')
      .on(table.refType, table.refId, table.materialId, table.movementType)
      .where(
        sql`${table.refType} = 'order' AND ${table.movementType} IN ('reserve','consume','reserve_release','refund_return')`,
      ),
  ],
);
