CREATE TABLE "accounting_contacts" (
	"merchant_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_contacts_merchant_id_customer_id_pk" PRIMARY KEY("merchant_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"amount_total" integer NOT NULL,
	"customer" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"success_url" text NOT NULL,
	"cancel_url" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"provider_reference" text,
	"provider_payment_id" text,
	"redirect_url" text,
	"accounting_status" text NOT NULL,
	"accounting_invoice_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"shop_webhook_url" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "merchants_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
ALTER TABLE "accounting_contacts" ADD CONSTRAINT "accounting_contacts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkouts_provider_reference_idx" ON "checkouts" USING btree ("merchant_id","provider","provider_reference");--> statement-breakpoint
CREATE INDEX "checkouts_reference_idx" ON "checkouts" USING btree ("merchant_id","reference");