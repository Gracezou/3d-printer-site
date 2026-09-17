ALTER TABLE "refunds" DROP CONSTRAINT "refunds_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "processing_token" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "processing_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "uq_refunds_order_idempotency_key" UNIQUE("order_id","idempotency_key");