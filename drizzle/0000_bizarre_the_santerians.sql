CREATE TABLE "document_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"source_sha256" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processing_finished_at" timestamp with time zone,
	"processing_meta" jsonb,
	"error" text,
	"invoice_number" text,
	"invoice_date" text,
	"seller_name" text,
	"seller_tax_id" text,
	"buyer_name" text,
	"buyer_tax_id" text,
	"buyer_iec" text,
	"currency" text,
	"total_invoice_value" numeric,
	"freight_charges" numeric,
	"freight_currency" text,
	"freight_included" boolean,
	"insurance_charges" numeric,
	"insurance_currency" text,
	"insurance_included" boolean,
	"other_charges" numeric,
	"other_charges_currency" text,
	"other_charges_included" boolean,
	"total_tax_amount" numeric,
	"is_arithmetic_valid" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reconciliation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_headers_page_count_check" CHECK ("document_headers"."page_count" >= 0),
	CONSTRAINT "document_headers_currency_check" CHECK ("document_headers"."currency" is null or "document_headers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "document_headers_freight_currency_check" CHECK ("document_headers"."freight_currency" is null or "document_headers"."freight_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "document_headers_insurance_currency_check" CHECK ("document_headers"."insurance_currency" is null or "document_headers"."insurance_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "document_headers_other_currency_check" CHECK ("document_headers"."other_charges_currency" is null or "document_headers"."other_charges_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "document_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"page_number" integer,
	"row_bbox" jsonb,
	"item_description" text,
	"hsn_code" text,
	"quantity" numeric,
	"unit_of_measure" text,
	"uom_as_printed" text,
	"unit_price" numeric,
	"total_line_amount" numeric,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "document_line_items_line_number_check" CHECK ("document_line_items"."line_number" >= 1),
	CONSTRAINT "document_line_items_page_number_check" CHECK ("document_line_items"."page_number" is null or "document_line_items"."page_number" >= 1),
	CONSTRAINT "document_line_items_hsn_check" CHECK ("document_line_items"."hsn_code" is null or "document_line_items"."hsn_code" ~ '^[0-9]{6,8}$')
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"source_kind" text NOT NULL,
	"png_data" "bytea",
	"image_width" integer,
	"image_height" integer,
	"ocr_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_error" text,
	"raw_model_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_pages_page_number_check" CHECK ("document_pages"."page_number" >= 1),
	CONSTRAINT "document_pages_kind_check" CHECK ("document_pages"."source_kind" in ('text', 'scan', 'image'))
);
--> statement-breakpoint
CREATE TABLE "field_confidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"line_number" integer,
	"field" text NOT NULL,
	"score" numeric(4, 3) NOT NULL,
	"raw_value" text,
	"normalized_value" text,
	"evidence" text,
	"page" integer,
	"bbox" jsonb,
	"source" text NOT NULL,
	"components" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_confidences_score_check" CHECK ("field_confidences"."score" >= 0 and "field_confidences"."score" <= 1),
	CONSTRAINT "field_confidences_page_check" CHECK ("field_confidences"."page" is null or "field_confidences"."page" >= 1),
	CONSTRAINT "field_confidences_source_check" CHECK ("field_confidences"."source" in ('text_layer', 'ocr', 'none'))
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"header_id" uuid PRIMARY KEY NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_byte_size_check" CHECK ("source_documents"."byte_size" > 0),
	CONSTRAINT "source_documents_mime_check" CHECK ("source_documents"."mime_type" in ('application/pdf', 'image/png', 'image/jpeg'))
);
--> statement-breakpoint
CREATE TABLE "validation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"field" text,
	"line_number" integer,
	"expected" text,
	"actual" text,
	"page" integer,
	"bbox" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_issues_severity_check" CHECK ("validation_issues"."severity" in ('low', 'medium', 'high')),
	CONSTRAINT "validation_issues_page_check" CHECK ("validation_issues"."page" is null or "validation_issues"."page" >= 1)
);
--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_header_id_document_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."document_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_header_id_document_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."document_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_confidences" ADD CONSTRAINT "field_confidences_header_id_document_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."document_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_header_id_document_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."document_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_header_id_document_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."document_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_headers_status_created_idx" ON "document_headers" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "document_headers_sha256_idx" ON "document_headers" USING btree ("source_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "document_line_items_header_line_uq" ON "document_line_items" USING btree ("header_id","line_number");--> statement-breakpoint
CREATE INDEX "document_line_items_header_idx" ON "document_line_items" USING btree ("header_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_header_page_uq" ON "document_pages" USING btree ("header_id","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "field_confidences_scope_uq" ON "field_confidences" USING btree ("header_id","field",coalesce("line_number", 0));--> statement-breakpoint
CREATE INDEX "field_confidences_header_idx" ON "field_confidences" USING btree ("header_id");--> statement-breakpoint
CREATE INDEX "validation_issues_header_idx" ON "validation_issues" USING btree ("header_id");