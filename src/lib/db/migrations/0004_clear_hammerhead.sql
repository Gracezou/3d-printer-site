CREATE TABLE "refund_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"items_amount" numeric(10, 2) NOT NULL,
	"discount_share" numeric(10, 2) NOT NULL,
	"shipping_share" numeric(10, 2) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"restock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_refund_items_refund_order_item" UNIQUE("refund_id","order_item_id"),
	CONSTRAINT "refund_items_quantity_check" CHECK ("refund_items"."quantity" > 0),
	CONSTRAINT "refund_items_amount_check" CHECK ("refund_items"."items_amount" >= 0 AND "refund_items"."discount_share" >= 0 AND "refund_items"."shipping_share" >= 0 AND "refund_items"."amount" >= 0 AND "refund_items"."amount" = "refund_items"."items_amount" - "refund_items"."discount_share" + "refund_items"."shipping_share")
);
--> statement-breakpoint
CREATE TABLE "return_request_items" (
	"request_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "return_request_items_request_id_order_item_id_pk" PRIMARY KEY("request_id","order_item_id"),
	CONSTRAINT "return_request_items_quantity_check" CHECK ("return_request_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" varchar(32) NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason_code" varchar(30) NOT NULL,
	"reason_text" varchar(500),
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"review_remark" text,
	"reviewed_at" timestamp with time zone,
	"refund_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_requests_request_no_unique" UNIQUE("request_no"),
	CONSTRAINT "return_requests_status_check" CHECK ("return_requests"."status" IN ('pending','approved','rejected','completed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_request_id_return_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."return_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_reviewer_id_admin_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_refund_items_order_item" ON "refund_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_return_request_items_order_item" ON "return_request_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_return_pending_per_order" ON "return_requests" USING btree ("order_id") WHERE "return_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_return_requests_user" ON "return_requests" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_return_requests_status" ON "return_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "refund_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "return_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "return_request_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "refund_items" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "return_requests" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "return_request_items" FROM anon, authenticated;--> statement-breakpoint
GRANT ALL ON TABLE "refund_items" TO service_role;--> statement-breakpoint
GRANT ALL ON TABLE "return_requests" TO service_role;--> statement-breakpoint
GRANT ALL ON TABLE "return_request_items" TO service_role;
