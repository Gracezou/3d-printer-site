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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { adminUsers } from './admin';
import { products, productVariants } from './product';
import { userProfiles } from './user';

export interface BomSnapshotItem {
  material_id: string;
  material_name: string;
  grams: string;
  waste_rate: string;
  required_grams: string;
}

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNo: varchar('order_no', { length: 32 }).notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 30 })
      .notNull()
      .default('pending_payment'),
    itemsAmount: numeric('items_amount', { precision: 10, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    shippingAmount: numeric('shipping_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    payableAmount: numeric('payable_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    paidAmount: numeric('paid_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    refundedAmount: numeric('refunded_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    discountCodeId: uuid('discount_code_id'),
    discountCode: varchar('discount_code', { length: 32 }),
    receiverName: varchar('receiver_name', { length: 50 }).notNull(),
    receiverPhone: varchar('receiver_phone', { length: 20 }).notNull(),
    receiverProvince: varchar('receiver_province', { length: 50 }).notNull(),
    receiverCity: varchar('receiver_city', { length: 50 }).notNull(),
    receiverDistrict: varchar('receiver_district', { length: 50 }).notNull(),
    receiverDetail: varchar('receiver_detail', { length: 200 }).notNull(),
    buyerRemark: varchar('buyer_remark', { length: 200 }),
    adminRemark: text('admin_remark'),
    reservedUntil: timestamp('reserved_until', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: varchar('cancel_reason', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'orders_status_check',
      sql`${table.status} IN ('pending_payment','paid','in_production','pending_shipment','shipped','completed','cancelled','refunding','refunded')`,
    ),
    check('orders_items_amount_check', sql`${table.itemsAmount} >= 0`),
    check('orders_discount_amount_check', sql`${table.discountAmount} >= 0`),
    check('orders_shipping_amount_check', sql`${table.shippingAmount} >= 0`),
    check('orders_payable_amount_check', sql`${table.payableAmount} >= 0`),
    index('idx_orders_user').on(table.userId, table.createdAt.desc()),
    index('idx_orders_status').on(table.status, table.createdAt.desc()),
    index('idx_orders_expiring')
      .on(table.reservedUntil)
      .where(sql`${table.status} = 'pending_payment'`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    productName: varchar('product_name', { length: 120 }).notNull(),
    variantName: varchar('variant_name', { length: 150 }).notNull(),
    skuCode: varchar('sku_code', { length: 64 }).notNull(),
    imageUrl: text('image_url'),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    bomSnapshot: jsonb('bom_snapshot')
      .$type<BomSnapshotItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('order_items_quantity_check', sql`${table.quantity} > 0`),
    index('idx_order_items_order').on(table.orderId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    outTradeNo: varchar('out_trade_no', { length: 64 }).notNull().unique(),
    provider: varchar('provider', { length: 30 }).notNull(),
    providerTxnId: varchar('provider_txn_id', { length: 64 }).unique(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    status: varchar('status', { length: 20 }).notNull().default('created'),
    rawNotify: jsonb('raw_notify').$type<Record<string, unknown>>(),
    needsManualReview: boolean('needs_manual_review').notNull().default(false),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'payments_provider_check',
      sql`${table.provider} IN ('alipay_page','wechat_native','mock')`,
    ),
    check(
      'payments_status_check',
      sql`${table.status} IN ('created','pending','success','failed','closed','refunded')`,
    ),
    index('idx_payments_order').on(table.orderId, table.createdAt.desc()),
    index('idx_payments_review')
      .on(table.needsManualReview)
      .where(sql`${table.needsManualReview} = true`),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    outRefundNo: varchar('out_refund_no', { length: 64 }).notNull().unique(),
    providerRefundId: varchar('provider_refund_id', { length: 64 }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    isFullRefund: boolean('is_full_refund').notNull(),
    restock: boolean('restock').notNull().default(false),
    reason: varchar('reason', { length: 200 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    operatorId: uuid('operator_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('refunds_amount_check', sql`${table.amount} > 0`),
    check(
      'refunds_status_check',
      sql`${table.status} IN ('pending','success','failed')`,
    ),
  ],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    quantity: integer('quantity').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    printerName: varchar('printer_name', { length: 50 }),
    assignedTo: uuid('assigned_to').references(() => adminUsers.id),
    failedCount: integer('failed_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('print_jobs_order_item_id_unique').on(table.orderItemId),
    check('print_jobs_quantity_check', sql`${table.quantity} > 0`),
    check(
      'print_jobs_status_check',
      sql`${table.status} IN ('queued','printing','post_processing','done','failed')`,
    ),
    index('idx_print_jobs_status').on(table.status, table.createdAt),
    index('idx_print_jobs_order').on(table.orderId),
  ],
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    carrierCode: varchar('carrier_code', { length: 30 }).notNull(),
    carrierName: varchar('carrier_name', { length: 50 }).notNull(),
    trackingNo: varchar('tracking_no', { length: 64 }).notNull(),
    shippedAt: timestamp('shipped_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    operatorId: uuid('operator_id').references(() => adminUsers.id),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_shipments_order').on(table.orderId)],
);
