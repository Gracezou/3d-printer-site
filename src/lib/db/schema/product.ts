import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    name: varchar('name', { length: 50 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: boolean('is_visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_categories_parent').on(table.parentId, table.sortOrder),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 150 }).notNull().unique(),
    subtitle: varchar('subtitle', { length: 200 }),
    description: text('description'),
    mainImageUrl: text('main_image_url'),
    gallery: jsonb('gallery')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    modelPreviewUrl: text('model_preview_url'),
    specs: jsonb('specs')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    minPrice: numeric('min_price', { precision: 10, scale: 2 }),
    soldCount: integer('sold_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'products_status_check',
      sql`${table.status} IN ('draft','on_sale','off_shelf')`,
    ),
    index('idx_products_status')
      .on(table.status, table.sortOrder.desc(), table.createdAt.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_products_category')
      .on(table.categoryId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_products_featured')
      .on(table.isFeatured, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    styleId: uuid('style_id').references(() => productStyles.id, {
      onDelete: 'set null',
    }),
    sourceMaterialId: uuid('source_material_id'),
    skuCode: varchar('sku_code', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 150 }).notNull(),
    attributes: jsonb('attributes')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    comparePrice: numeric('compare_price', { precision: 10, scale: 2 }),
    weightGrams: numeric('weight_grams', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    printHours: numeric('print_hours', { precision: 6, scale: 2 }),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('product_variants_price_check', sql`${table.price} >= 0`),
    index('idx_variants_product').on(table.productId, table.sortOrder),
    index('idx_variants_style').on(table.styleId),
    uniqueIndex('uq_variant_style_material')
      .on(table.styleId, table.sourceMaterialId)
      .where(sql`${table.sourceMaterialId} IS NOT NULL`),
  ],
);

export const productStyles = pgTable(
  'product_styles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    weightGrams: numeric('weight_grams', { precision: 10, scale: 2 }).notNull(),
    materialGrams: numeric('material_grams', {
      precision: 10,
      scale: 2,
    }).notNull(),
    printHours: numeric('print_hours', { precision: 6, scale: 2 }),
    imageUrl: text('image_url'),
    singleMaterialMode: varchar('single_material_mode', { length: 20 })
      .$type<'none' | 'selected' | 'all'>()
      .notNull()
      .default('none'),
    materialIds: jsonb('material_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_product_style_name').on(table.productId, table.name),
    index('idx_styles_product').on(table.productId, table.sortOrder),
    check('styles_price_check', sql`${table.price} >= 0`),
    check(
      'styles_grams_check',
      sql`${table.weightGrams} >= 0 AND ${table.materialGrams} > 0`,
    ),
    check(
      'styles_mode_check',
      sql`${table.singleMaterialMode} IN ('none','selected','all')`,
    ),
  ],
);
