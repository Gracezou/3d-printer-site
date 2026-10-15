import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export type BusinessEmailKind =
  | 'payment_paid'
  | 'production_started'
  | 'order_shipped'
  | 'return_approved'
  | 'return_rejected'
  | 'refund_succeeded'
  | 'model_opened';

export interface BusinessEmailPayload {
  orderNo?: string;
  requestNo?: string;
  modelName?: string;
  productName?: string;
  modelRequestId?: string;
  path: string;
}

export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull().unique(),
    kind: varchar('kind', { length: 40 }).$type<BusinessEmailKind>().notNull(),
    recipientEmail: varchar('recipient_email', { length: 320 }).notNull(),
    payload: jsonb('payload').$type<BusinessEmailPayload>().notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    lastError: varchar('last_error', { length: 400 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'email_messages_kind_check',
      sql`${table.kind} IN ('payment_paid','production_started','order_shipped','return_approved','return_rejected','refund_succeeded','model_opened')`,
    ),
    check(
      'email_messages_status_check',
      sql`${table.status} IN ('pending','sending','sent','failed','unknown')`,
    ),
    check('email_messages_attempts_check', sql`${table.attempts} >= 0`),
    index('idx_email_messages_dispatch').on(table.status, table.nextAttemptAt),
    index('idx_email_messages_lease').on(table.status, table.leaseUntil),
  ],
);
