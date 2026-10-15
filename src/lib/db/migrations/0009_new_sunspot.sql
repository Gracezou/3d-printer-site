CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"provider_message_id" text,
	"last_error" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_messages_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "email_messages_kind_check" CHECK ("email_messages"."kind" IN ('payment_paid','production_started','order_shipped','return_approved','return_rejected','refund_succeeded','model_opened')),
	CONSTRAINT "email_messages_status_check" CHECK ("email_messages"."status" IN ('pending','sending','sent','failed','unknown')),
	CONSTRAINT "email_messages_attempts_check" CHECK ("email_messages"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idx_email_messages_dispatch" ON "email_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_email_messages_lease" ON "email_messages" USING btree ("status","lease_until");--> statement-breakpoint
ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "email_messages" FROM anon, authenticated;--> statement-breakpoint
GRANT ALL ON TABLE "email_messages" TO service_role;
