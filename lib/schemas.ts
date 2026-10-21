import { z } from 'zod';

/** Runtime validation for everything the browser receives from the API. */

export const invoiceStatusSchema = z.enum([
  'Queued',
  'Processing',
  'Succeeded',
  'Needs review',
  'Failed',
  'Rejected',
]);

export const invoiceMachineStatusSchema = z.enum([
  'queued',
  'processing',
  'succeeded',
  'needs_review',
  'failed',
  'rejected',
]);

export const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const fieldSourceLocationSchema = z.object({
  page: z.number().int().min(1),
  bbox: bboxSchema,
});

export const fieldMetadataSchema = z.object({
  value: z.string().nullable().optional(),
  rawText: z.string().nullable().optional(),
  normalizedValue: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  source: fieldSourceLocationSchema.nullable().optional(),
  evidence: z.string().nullable().optional(),
});

export const confidenceDataSchema = z.record(z.string(), fieldMetadataSchema);

export const invoiceHeaderSchema = z.object({
  source_file: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  seller_name: z.string().nullable(),
  seller_tax_id: z.string().nullable(),
  buyer_name: z.string().nullable(),
  buyer_tax_id: z.string().nullable(),
  buyer_iec: z.string().nullable(),
  currency: z.string().nullable(),
  total_invoice_value: z.string().nullable(),
  freight_charges: z.string().nullable(),
  freight_currency: z.string().nullable(),
  insurance_charges: z.string().nullable(),
  insurance_currency: z.string().nullable(),
  other_charges: z.string().nullable(),
  total_tax_amount: z.string().nullable(),
});

export const invoiceLineItemSchema = z.object({
  line_number: z.number().int().nullable(),
  item_description: z.string().nullable(),
  hsn_code: z.string().nullable(),
  quantity: z.string().nullable(),
  unit_of_measure: z.string().nullable(),
  uom_as_printed: z.string().nullable(),
  unit_price: z.string().nullable(),
  total_line_amount: z.string().nullable(),
});

export const validationIssueTypeSchema = z.enum([
  'arithmetic_mismatch',
  'low_confidence',
  'missing_field',
  'ambiguous_text',
  'currency_mismatch',
  'processing_failure',
  'missing_provenance',
  'other',
]);

export const validationIssueSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: validationIssueTypeSchema,
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string(),
  fieldName: z.string().nullable().optional(),
  lineNumber: z.number().int().nullable().optional(),
  expected: z.string().nullable().optional(),
  actual: z.string().nullable().optional(),
  source: fieldSourceLocationSchema.nullable().optional(),
});

export const reconciliationSchema = z.object({
  status: z.enum(['valid', 'mismatch', 'incomplete']),
  lineSum: z.string().nullable(),
  chargeSum: z.string().nullable(),
  taxAmount: z.string().nullable(),
  expectedTotal: z.string().nullable(),
  printedTotal: z.string().nullable(),
  delta: z.string().nullable(),
  tolerance: z.string().nullable(),
  includedCharges: z.array(z.string()),
  excludedCharges: z.array(z.string()),
  lineMismatchCount: z.number().int().nonnegative().optional(),
  lineIncompleteCount: z.number().int().nonnegative().optional(),
  message: z.string(),
});

export const invoiceResultSchema = z.object({
  document: z.string(),
  header: invoiceHeaderSchema,
  line_items: z.array(invoiceLineItemSchema),
  is_arithmetic_valid: z.boolean(),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string()),
  confidence: confidenceDataSchema,
  validation_issues: z.array(validationIssueSchema),
});

export const invoicePageSchema = z.object({
  page: z.number().int().min(1),
  imageUrl: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

export const invoiceSummarySchema = z.object({
  id: z.string(),
  sourceFilename: z.string(),
  documentName: z.string(),
  status: invoiceStatusSchema,
  machineStatus: invoiceMachineStatusSchema,
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  currency: z.string().nullable(),
  totalInvoiceValue: z.string().nullable(),
  lineItemCount: z.number().int().nonnegative(),
  lastUpdated: z.string(),
});

export const invoiceSchema = invoiceSummarySchema.extend({
  pageCount: z.number().int().nonnegative(),
  pages: z.array(invoicePageSchema),
  result: invoiceResultSchema,
  reconciliation: reconciliationSchema.nullable(),
  processingError: z.string().nullable(),
  createdAt: z.string(),
});

export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceSummarySchema),
});

export const invoiceDetailResponseSchema = z.object({
  invoice: invoiceSchema,
});

export const uploadResponseSchema = z.object({
  invoiceId: z.string(),
});

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
