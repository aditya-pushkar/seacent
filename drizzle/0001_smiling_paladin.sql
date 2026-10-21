ALTER TABLE "document_headers" DROP CONSTRAINT "document_headers_page_count_check";--> statement-breakpoint
ALTER TABLE "document_headers" DROP CONSTRAINT "document_headers_currency_check";--> statement-breakpoint
ALTER TABLE "document_headers" DROP CONSTRAINT "document_headers_freight_currency_check";--> statement-breakpoint
ALTER TABLE "document_headers" DROP CONSTRAINT "document_headers_insurance_currency_check";--> statement-breakpoint
ALTER TABLE "document_headers" DROP CONSTRAINT "document_headers_other_currency_check";--> statement-breakpoint
ALTER TABLE "document_line_items" DROP CONSTRAINT "document_line_items_line_number_check";--> statement-breakpoint
ALTER TABLE "document_line_items" DROP CONSTRAINT "document_line_items_page_number_check";--> statement-breakpoint
ALTER TABLE "document_line_items" DROP CONSTRAINT "document_line_items_hsn_check";--> statement-breakpoint
ALTER TABLE "document_pages" DROP CONSTRAINT "document_pages_page_number_check";--> statement-breakpoint
ALTER TABLE "document_pages" DROP CONSTRAINT "document_pages_kind_check";--> statement-breakpoint
ALTER TABLE "field_confidences" DROP CONSTRAINT "field_confidences_score_check";--> statement-breakpoint
ALTER TABLE "field_confidences" DROP CONSTRAINT "field_confidences_page_check";--> statement-breakpoint
ALTER TABLE "field_confidences" DROP CONSTRAINT "field_confidences_source_check";--> statement-breakpoint
ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_byte_size_check";--> statement-breakpoint
ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_mime_check";--> statement-breakpoint
ALTER TABLE "validation_issues" DROP CONSTRAINT "validation_issues_severity_check";--> statement-breakpoint
ALTER TABLE "validation_issues" DROP CONSTRAINT "validation_issues_page_check";