import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const shippingRules = pgTable('shipping_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  provinceCodes: jsonb('province_codes')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  firstWeightGrams: numeric('first_weight_grams', { precision: 10, scale: 2 })
    .notNull()
    .default('1000'),
  firstAmount: numeric('first_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  additionalWeightGrams: numeric('additional_weight_grams', {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default('500'),
  additionalAmount: numeric('additional_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  freeThreshold: numeric('free_threshold', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const settings = pgTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  remark: text('remark'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
