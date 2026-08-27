CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"nickname" varchar(50),
	"avatar_url" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_phone_unique" UNIQUE("phone"),
	CONSTRAINT "user_profiles_status_check" CHECK ("user_profiles"."status" IN ('active','disabled'))
);

--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"receiver_name" varchar(50) NOT NULL,
	"receiver_phone" varchar(20) NOT NULL,
	"province" varchar(50) NOT NULL,
	"province_code" varchar(10) NOT NULL,
	"city" varchar(50) NOT NULL,
	"district" varchar(50) NOT NULL,
	"detail" varchar(200) NOT NULL,
	"postal_code" varchar(10),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(50) NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_code_unique" UNIQUE("code")
);

--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(50) NOT NULL,
	"role_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username"),
	CONSTRAINT "admin_users_status_check" CHECK ("admin_users"."status" IN ('active','disabled'))
);

--> statement-breakpoint
CREATE TABLE "admin_operation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"admin_name" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(50),
	"target_id" varchar(100),
	"payload" jsonb,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" varchar(50) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);

--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"name" varchar(120) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"subtitle" varchar(200),
	"description" text,
	"main_image_url" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_preview_url" text,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"min_price" numeric(10, 2),
	"sold_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_status_check" CHECK ("products"."status" IN ('draft','on_sale','off_shelf'))
);

--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"name" varchar(150) NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"compare_price" numeric(10, 2),
	"weight_grams" numeric(10, 2) DEFAULT '0' NOT NULL,
	"print_hours" numeric(6, 2),
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_code_unique" UNIQUE("sku_code"),
	CONSTRAINT "product_variants_price_check" CHECK ("product_variants"."price" >= 0)
);

--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"material_type" varchar(30) NOT NULL,
	"color_name" varchar(50),
	"color_hex" varchar(7),
	"brand" varchar(50),
	"spec" varchar(50),
	"unit_cost_per_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stock_grams" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reserved_grams" numeric(12, 2) DEFAULT '0' NOT NULL,
	"safety_grams" numeric(12, 2) DEFAULT '0' NOT NULL,
	"waste_rate" numeric(5, 4) DEFAULT '0.0500' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"supplier" varchar(100),
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_code_unique" UNIQUE("code"),
	CONSTRAINT "materials_material_type_check" CHECK ("materials"."material_type" IN ('PLA','PETG','ABS','TPU','ASA','PA','RESIN','OTHER')),
	CONSTRAINT "materials_reserved_grams_check" CHECK ("materials"."reserved_grams" >= 0),
	CONSTRAINT "materials_safety_grams_check" CHECK ("materials"."safety_grams" >= 0),
	CONSTRAINT "materials_waste_rate_check" CHECK ("materials"."waste_rate" >= 0 AND "materials"."waste_rate" < 1)
);

--> statement-breakpoint
CREATE TABLE "variant_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"grams" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_materials_variant_id_material_id_unique" UNIQUE("variant_id","material_id"),
	CONSTRAINT "variant_materials_grams_check" CHECK ("variant_materials"."grams" > 0)
);

--> statement-breakpoint
CREATE TABLE "material_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"movement_type" varchar(30) NOT NULL,
	"delta_stock_grams" numeric(12, 2) DEFAULT '0' NOT NULL,
	"delta_reserved_grams" numeric(12, 2) DEFAULT '0' NOT NULL,
	"stock_after" numeric(12, 2) NOT NULL,
	"reserved_after" numeric(12, 2) NOT NULL,
	"ref_type" varchar(30),
	"ref_id" varchar(64),
	"batch_no" varchar(64),
	"unit_cost_per_kg" numeric(10, 2),
	"operator_type" varchar(20) DEFAULT 'system' NOT NULL,
	"operator_id" uuid,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_stock_movements_movement_type_check" CHECK ("material_stock_movements"."movement_type" IN ('purchase_in','manual_in','manual_out','adjust','reserve','reserve_release','consume','reprint_loss','refund_return')),
	CONSTRAINT "material_stock_movements_operator_type_check" CHECK ("material_stock_movements"."operator_type" IN ('system','admin'))
);

--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_user_id_unique" UNIQUE("user_id")
);

--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_id_variant_id_unique" UNIQUE("cart_id","variant_id"),
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" > 0 AND "cart_items"."quantity" <= 99)
);

--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(32) NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'pending_payment' NOT NULL,
	"items_amount" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"shipping_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"payable_amount" numeric(10, 2) NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"refunded_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_code_id" uuid,
	"discount_code" varchar(32),
	"receiver_name" varchar(50) NOT NULL,
	"receiver_phone" varchar(20) NOT NULL,
	"receiver_province" varchar(50) NOT NULL,
	"receiver_city" varchar(50) NOT NULL,
	"receiver_district" varchar(50) NOT NULL,
	"receiver_detail" varchar(200) NOT NULL,
	"buyer_remark" varchar(200),
	"admin_remark" text,
	"reserved_until" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('pending_payment','paid','in_production','pending_shipment','shipped','completed','cancelled','refunding','refunded')),
	CONSTRAINT "orders_items_amount_check" CHECK ("orders"."items_amount" >= 0),
	CONSTRAINT "orders_discount_amount_check" CHECK ("orders"."discount_amount" >= 0),
	CONSTRAINT "orders_shipping_amount_check" CHECK ("orders"."shipping_amount" >= 0),
	CONSTRAINT "orders_payable_amount_check" CHECK ("orders"."payable_amount" >= 0)
);

--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" varchar(120) NOT NULL,
	"variant_name" varchar(150) NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"image_url" text,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"bom_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0)
);

--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"provider" varchar(30) NOT NULL,
	"provider_txn_id" varchar(64),
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"raw_notify" jsonb,
	"needs_manual_review" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_out_trade_no_unique" UNIQUE("out_trade_no"),
	CONSTRAINT "payments_provider_txn_id_unique" UNIQUE("provider_txn_id"),
	CONSTRAINT "payments_provider_check" CHECK ("payments"."provider" IN ('alipay_page','wechat_native','mock')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('created','pending','success','failed','closed','refunded'))
);

--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"out_refund_no" varchar(64) NOT NULL,
	"provider_refund_id" varchar(64),
	"amount" numeric(10, 2) NOT NULL,
	"is_full_refund" boolean NOT NULL,
	"restock" boolean DEFAULT false NOT NULL,
	"reason" varchar(200),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_out_refund_no_unique" UNIQUE("out_refund_no"),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount" > 0),
	CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" IN ('pending','success','failed'))
);

--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"printer_name" varchar(50),
	"assigned_to" uuid,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "print_jobs_quantity_check" CHECK ("print_jobs"."quantity" > 0),
	CONSTRAINT "print_jobs_status_check" CHECK ("print_jobs"."status" IN ('queued','printing','post_processing','done','failed'))
);

--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier_code" varchar(30) NOT NULL,
	"carrier_name" varchar(50) NOT NULL,
	"tracking_no" varchar(64) NOT NULL,
	"shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_id" uuid,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount_amount" numeric(10, 2),
	"scope" varchar(20) DEFAULT 'all' NOT NULL,
	"scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_discount_type_check" CHECK ("promotions"."discount_type" IN ('fixed_amount','percentage','free_shipping')),
	CONSTRAINT "promotions_scope_check" CHECK ("promotions"."scope" IN ('all','category','product'))
);

--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"code_type" varchar(20) NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_codes_code_type_check" CHECK ("discount_codes"."code_type" IN ('permanent','limited')),
	CONSTRAINT "discount_codes_used_count_check" CHECK ("discount_codes"."used_count" >= 0),
	CONSTRAINT "discount_codes_per_user_limit_check" CHECK ("discount_codes"."per_user_limit" > 0),
	CONSTRAINT "chk_code_type_uses" CHECK (("discount_codes"."code_type" = 'permanent' AND "discount_codes"."max_uses" IS NULL) OR ("discount_codes"."code_type" = 'limited' AND "discount_codes"."max_uses" > 0)),
	CONSTRAINT "chk_code_period" CHECK ("discount_codes"."ends_at" IS NULL OR "discount_codes"."ends_at" > "discount_codes"."starts_at")
);

--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_amount" numeric(10, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'occupied' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "discount_redemptions_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "discount_redemptions_status_check" CHECK ("discount_redemptions"."status" IN ('occupied','confirmed','released'))
);

--> statement-breakpoint
CREATE TABLE "user_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(32),
	"status" varchar(20) DEFAULT 'unused' NOT NULL,
	"order_id" uuid,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_coupons_status_check" CHECK ("user_coupons"."status" IN ('unused','used','expired'))
);

--> statement-breakpoint
CREATE TABLE "shipping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"province_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_weight_grams" numeric(10, 2) DEFAULT '1000' NOT NULL,
	"first_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"additional_weight_grams" numeric(10, 2) DEFAULT '500' NOT NULL,
	"additional_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"free_threshold" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"remark" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "variant_materials" ADD CONSTRAINT "variant_materials_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "variant_materials" ADD CONSTRAINT "variant_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_operator_id_admin_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_operator_id_admin_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_code_id_discount_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."discount_codes"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_admin_logs_admin" ON "admin_operation_logs" USING btree ("admin_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_admin_logs_target" ON "admin_operation_logs" USING btree ("target_type","target_id");
--> statement-breakpoint
CREATE INDEX "idx_movements_material" ON "material_stock_movements" USING btree ("material_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_movements_ref" ON "material_stock_movements" USING btree ("ref_type","ref_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_movements_order_once" ON "material_stock_movements" USING btree ("ref_type","ref_id","material_id","movement_type") WHERE "material_stock_movements"."ref_type" = 'order' AND "material_stock_movements"."movement_type" IN ('reserve','consume','reserve_release','refund_return');
--> statement-breakpoint
CREATE INDEX "idx_materials_active" ON "materials" USING btree ("is_active","material_type");
--> statement-breakpoint
CREATE INDEX "idx_vm_material" ON "variant_materials" USING btree ("material_id");
--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "idx_orders_user" ON "orders" USING btree ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_orders_expiring" ON "orders" USING btree ("reserved_until") WHERE "orders"."status" = 'pending_payment';
--> statement-breakpoint
CREATE INDEX "idx_payments_order" ON "payments" USING btree ("order_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_payments_review" ON "payments" USING btree ("needs_manual_review") WHERE "payments"."needs_manual_review" = true;
--> statement-breakpoint
CREATE INDEX "idx_print_jobs_status" ON "print_jobs" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "idx_print_jobs_order" ON "print_jobs" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "idx_shipments_order" ON "shipments" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id","sort_order");
--> statement-breakpoint
CREATE INDEX "idx_variants_product" ON "product_variants" USING btree ("product_id","sort_order");
--> statement-breakpoint
CREATE INDEX "idx_products_status" ON "products" USING btree ("status","sort_order" DESC NULLS LAST,"created_at" DESC NULLS LAST) WHERE "products"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id","status") WHERE "products"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_products_featured" ON "products" USING btree ("is_featured","status") WHERE "products"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_codes_active" ON "discount_codes" USING btree ("is_active","starts_at","ends_at");
--> statement-breakpoint
CREATE INDEX "idx_redemptions_user_code" ON "discount_redemptions" USING btree ("code_id","user_id") WHERE "discount_redemptions"."status" IN ('occupied','confirmed');
--> statement-breakpoint
CREATE INDEX "idx_addresses_user" ON "addresses" USING btree ("user_id") WHERE "addresses"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_addresses_default" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_default" = true AND "addresses"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_user_profiles_phone" ON "user_profiles" USING btree ("phone");
