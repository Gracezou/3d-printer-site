ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_phone_unique";--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_user_profiles_email" ON "user_profiles" USING btree ("email");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_email_unique" UNIQUE("email");