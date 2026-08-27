import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { orders } from './order';
import { userProfiles } from './user';

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    discountType: varchar('discount_type', { length: 20 }).notNull(),
    discountValue: numeric('discount_value', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    minOrderAmount: numeric('min_order_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    maxDiscountAmount: numeric('max_discount_amount', {
      precision: 10,
      scale: 2,
    }),
    scope: varchar('scope', { length: 20 }).notNull().default('all'),
    scopeIds: jsonb('scope_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'promotions_discount_type_check',
      sql`${table.discountType} IN ('fixed_amount','percentage','free_shipping')`,
    ),
    check(
      'promotions_scope_check',
      sql`${table.scope} IN ('all','category','product')`,
    ),
  ],
);

export const discountCodes = pgTable(
  'discount_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promotionId: uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull().unique(),
    codeType: varchar('code_type', { length: 20 }).notNull(),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
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
      'discount_codes_code_type_check',
      sql`${table.codeType} IN ('permanent','limited')`,
    ),
    check('discount_codes_used_count_check', sql`${table.usedCount} >= 0`),
    check(
      'discount_codes_per_user_limit_check',
      sql`${table.perUserLimit} > 0`,
    ),
    check(
      'chk_code_type_uses',
      sql`(${table.codeType} = 'permanent' AND ${table.maxUses} IS NULL) OR (${table.codeType} = 'limited' AND ${table.maxUses} > 0)`,
    ),
    check(
      'chk_code_period',
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    index('idx_codes_active').on(table.isActive, table.startsAt, table.endsAt),
  ],
);

export const discountRedemptions = pgTable(
  'discount_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => discountCodes.id, { onDelete: 'restrict' }),
    promotionId: uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'cascade' }),
    discountAmount: numeric('discount_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('occupied'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'discount_redemptions_status_check',
      sql`${table.status} IN ('occupied','confirmed','released')`,
    ),
    index('idx_redemptions_user_code')
      .on(table.codeId, table.userId)
      .where(sql`${table.status} IN ('occupied','confirmed')`),
  ],
);

export const userCoupons = pgTable(
  'user_coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promotionId: uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }),
    status: varchar('status', { length: 20 }).notNull().default('unused'),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'user_coupons_status_check',
      sql`${table.status} IN ('unused','used','expired')`,
    ),
  ],
);
