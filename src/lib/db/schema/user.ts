import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { productVariants } from './product';

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull().unique(),
    nickname: varchar('nickname', { length: 50 }),
    avatarUrl: text('avatar_url'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'user_profiles_status_check',
      sql`${table.status} IN ('active','disabled')`,
    ),
    index('idx_user_profiles_phone').on(table.phone),
  ],
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    receiverName: varchar('receiver_name', { length: 50 }).notNull(),
    receiverPhone: varchar('receiver_phone', { length: 20 }).notNull(),
    province: varchar('province', { length: 50 }).notNull(),
    provinceCode: varchar('province_code', { length: 10 }).notNull(),
    city: varchar('city', { length: 50 }).notNull(),
    district: varchar('district', { length: 50 }).notNull(),
    detail: varchar('detail', { length: 200 }).notNull(),
    postalCode: varchar('postal_code', { length: 10 }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_addresses_user')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uq_addresses_default')
      .on(table.userId)
      .where(sql`${table.isDefault} = true AND ${table.deletedAt} IS NULL`),
  ],
);

export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => userProfiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'cart_items_quantity_check',
      sql`${table.quantity} > 0 AND ${table.quantity} <= 99`,
    ),
    unique('cart_items_cart_id_variant_id_unique').on(
      table.cartId,
      table.variantId,
    ),
  ],
);
