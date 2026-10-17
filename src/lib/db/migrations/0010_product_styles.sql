CREATE TABLE "product_styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"weight_grams" numeric(10, 2) NOT NULL,
	"material_grams" numeric(10, 2) NOT NULL,
	"print_hours" numeric(6, 2),
	"image_url" text,
	"single_material_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "styles_price_check" CHECK ("product_styles"."price" >= 0),
	CONSTRAINT "styles_grams_check" CHECK ("product_styles"."weight_grams" >= 0 AND "product_styles"."material_grams" > 0),
	CONSTRAINT "styles_mode_check" CHECK ("product_styles"."single_material_mode" IN ('none','selected','all'))
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "style_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "source_material_id" uuid;--> statement-breakpoint
ALTER TABLE "product_styles" ADD CONSTRAINT "product_styles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_style_name" ON "product_styles" USING btree ("product_id","name");--> statement-breakpoint
CREATE INDEX "idx_styles_product" ON "product_styles" USING btree ("product_id","sort_order");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_style_id_product_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."product_styles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_variant_style_material" ON "product_variants" USING btree ("style_id","source_material_id") WHERE "product_variants"."source_material_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_styles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "product_styles" FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE "product_styles" TO service_role;
