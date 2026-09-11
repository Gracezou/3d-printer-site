CREATE TABLE "device_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"release_year" integer,
	"is_discontinued" boolean DEFAULT false NOT NULL,
	"is_molded" boolean DEFAULT false NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compat_group" varchar(50),
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_release_year_check" CHECK ("device_models"."release_year" IS NULL OR "device_models"."release_year" BETWEEN 2000 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "model_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_model_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"note" varchar(200),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_requests_status_check" CHECK ("model_requests"."status" IN ('pending','notified','fulfilled'))
);
--> statement-breakpoint
CREATE TABLE "product_device_models" (
	"product_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_device_models_product_id_device_model_id_pk" PRIMARY KEY("product_id","device_model_id")
);
--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_brand_id_device_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."device_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_requests" ADD CONSTRAINT "model_requests_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_device_models" ADD CONSTRAINT "product_device_models_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_device_models" ADD CONSTRAINT "product_device_models_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_models_brand_slug" ON "device_models" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_device_models_brand" ON "device_models" USING btree ("brand_id","is_visible","sort_order");--> statement-breakpoint
CREATE INDEX "idx_device_models_compat_group" ON "device_models" USING btree ("compat_group");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_model_requests_device_email" ON "model_requests" USING btree ("device_model_id","email");--> statement-breakpoint
CREATE INDEX "idx_model_requests_device_status" ON "model_requests" USING btree ("device_model_id","status");--> statement-breakpoint
CREATE INDEX "idx_model_requests_created" ON "model_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_product_device_models_device" ON "product_device_models" USING btree ("device_model_id");--> statement-breakpoint
ALTER TABLE "device_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_device_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "model_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "device_brands" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "device_models" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "product_device_models" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "model_requests" FROM anon, authenticated;--> statement-breakpoint
GRANT ALL ON TABLE "device_brands" TO service_role;--> statement-breakpoint
GRANT ALL ON TABLE "device_models" TO service_role;--> statement-breakpoint
GRANT ALL ON TABLE "product_device_models" TO service_role;--> statement-breakpoint
GRANT ALL ON TABLE "model_requests" TO service_role;
