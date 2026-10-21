import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InvoiceMachineStatus, Reconciliation } from '../../../lib/types';

export const documentHeaders = pgTable(
  'document_headers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceFile: text('source_file').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    status: text('status').$type<InvoiceMachineStatus>().notNull().default('queued'),
    pageCount: integer('page_count').notNull().default(0),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    processingFinishedAt: timestamp('processing_finished_at', { withTimezone: true }),
    processingMeta: jsonb('processing_meta').$type<Record<string, unknown>>(),
    error: text('error'),

    invoiceNumber: text('invoice_number'),
    invoiceDate: text('invoice_date'),
    sellerName: text('seller_name'),
    sellerTaxId: text('seller_tax_id'),
    buyerName: text('buyer_name'),
    buyerTaxId: text('buyer_tax_id'),
    buyerIec: text('buyer_iec'),
    currency: text('currency'),
    totalInvoiceValue: numeric('total_invoice_value'),
    freightCharges: numeric('freight_charges'),
    freightCurrency: text('freight_currency'),
    freightIncluded: boolean('freight_included'),
    insuranceCharges: numeric('insurance_charges'),
    insuranceCurrency: text('insurance_currency'),
    insuranceIncluded: boolean('insurance_included'),
    otherCharges: numeric('other_charges'),
    otherChargesCurrency: text('other_charges_currency'),
    otherChargesIncluded: boolean('other_charges_included'),
    totalTaxAmount: numeric('total_tax_amount'),

    isArithmeticValid: boolean('is_arithmetic_valid').notNull().default(false),
    needsReview: boolean('needs_review').notNull().default(false),
    reviewReasons: jsonb('review_reasons').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    reconciliation: jsonb('reconciliation').$type<Reconciliation>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('document_headers_status_created_idx').on(table.status, table.createdAt),
    index('document_headers_sha256_idx').on(table.sourceSha256),
  ],
);

export type DocumentHeader = typeof documentHeaders.$inferSelect;
export type NewDocumentHeader = typeof documentHeaders.$inferInsert;
