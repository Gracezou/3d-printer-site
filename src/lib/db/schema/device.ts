import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { products } from './product';

export interface DeviceDimensions {
  widthMm?: number;
  heightMm?: number;
  thicknessMm?: number;
  weightGrams?: number;
}

export const deviceBrands = pgTable('device_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  aliases: jsonb('aliases')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  isVisible: boolean('is_visible').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const deviceModels = pgTable(
  'device_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => deviceBrands.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    aliases: jsonb('aliases')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    releaseYear: integer('release_year'),
    isDiscontinued: boolean('is_discontinued').notNull().default(false),
    isMolded: boolean('is_molded').notNull().default(false),
    dimensions: jsonb('dimensions')
      .$type<DeviceDimensions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    compatGroup: varchar('compat_group', { length: 50 }),
    notes: text('notes'),
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
    uniqueIndex('uq_device_models_brand_slug').on(table.brandId, table.slug),
    index('idx_device_models_brand').on(
      table.brandId,
      table.isVisible,
      table.sortOrder,
    ),
    index('idx_device_models_compat_group').on(table.compatGroup),
    check(
      'device_models_release_year_check',
      sql`${table.releaseYear} IS NULL OR ${table.releaseYear} BETWEEN 2000 AND 2100`,
    ),
  ],
);

export const productDeviceModels = pgTable(
  'product_device_models',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    deviceModelId: uuid('device_model_id')
      .notNull()
      .references(() => deviceModels.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.deviceModelId] }),
    index('idx_product_device_models_device').on(table.deviceModelId),
  ],
);

export const modelRequests = pgTable(
  'model_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceModelId: uuid('device_model_id')
      .notNull()
      .references(() => deviceModels.id, { onDelete: 'restrict' }),
    email: varchar('email', { length: 255 }).notNull(),
    note: varchar('note', { length: 200 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_model_requests_device_email').on(
      table.deviceModelId,
      table.email,
    ),
    index('idx_model_requests_device_status').on(
      table.deviceModelId,
      table.status,
    ),
    index('idx_model_requests_created').on(table.createdAt.desc()),
    check(
      'model_requests_status_check',
      sql`${table.status} IN ('pending','notified','fulfilled')`,
    ),
  ],
);
