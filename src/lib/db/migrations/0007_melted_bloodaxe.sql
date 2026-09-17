ALTER TABLE "refunds" ADD COLUMN "idempotency_key" varchar(64);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "needs_manual_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "previous_order_status" varchar(30);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key");