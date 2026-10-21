import { z } from 'zod';
import type { ExtractedPage } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Docservice contract                                                 */
/* ------------------------------------------------------------------ */

const bboxValue = z.number().min(0).max(1);

export const docServiceWordSchema = z.object({
  text: z.string(),
  x0: bboxValue,
  y0: bboxValue,
  x1: bboxValue,
  y1: bboxValue,
  conf: z.number().min(0).max(1),
  source: z.enum(['text_layer', 'ocr']),
});

export const docServicePageSchema = z.object({
  page: z.number().int().min(1),
  kind: z.enum(['text', 'scan', 'image']),
  width_pt: z.number().nullable(),
  height_pt: z.number().nullable(),
  image_width: z.number().int().min(1),
  image_height: z.number().int().min(1),
  words: z.array(docServiceWordSchema),
  image_b64: z.string().nullable(),
  error: z.string().nullable(),
});

export const docServiceResponseSchema = z.object({
  filename: z.string(),
  page_count: z.number().int().min(1),
  pages: z.array(docServicePageSchema).min(1),
  elapsed_ms: z.number().int().nonnegative(),
});

export type DocServiceResponse = z.infer<typeof docServiceResponseSchema>;
export type DocServicePage = z.infer<typeof docServicePageSchema>;

/* ------------------------------------------------------------------ */
/* VLM extraction contract                                             */
/* ------------------------------------------------------------------ */

const nullableString = z.string().nullable();

export const extractedHeaderSchema = z.object({
  invoice_number: nullableString,
  invoice_date: nullableString,
  seller_name: nullableString,
  seller_tax_id: nullableString,
  buyer_name: nullableString,
  buyer_tax_id: nullableString,
  buyer_iec: nullableString,
  currency: nullableString,
  total_invoice_value: nullableString,
  freight_charges: nullableString,
  freight_currency: nullableString,
  freight_included: z.boolean().nullable(),
  insurance_charges: nullableString,
  insurance_currency: nullableString,
  insurance_included: z.boolean().nullable(),
  other_charges: nullableString,
  other_charges_currency: nullableString,
  other_charges_included: z.boolean().nullable(),
  total_tax_amount: nullableString,
});

export const extractedLineItemSchema = z.object({
  printed_row_number: nullableString,
  description: nullableString,
  hsn_code: nullableString,
  quantity: nullableString,
  unit_of_measure: nullableString,
  unit_price: nullableString,
  total_line_amount: nullableString,
  row_text: nullableString,
  evidence: z.object({
    description: nullableString,
    hsn_code: nullableString,
    quantity: nullableString,
    unit_of_measure: nullableString,
    unit_price: nullableString,
    total_line_amount: nullableString,
    row_text: nullableString,
  }),
});

const headerEvidenceSchema = z.object({
  invoice_number: nullableString,
  invoice_date: nullableString,
  seller_name: nullableString,
  seller_tax_id: nullableString,
  buyer_name: nullableString,
  buyer_tax_id: nullableString,
  buyer_iec: nullableString,
  currency: nullableString,
  total_invoice_value: nullableString,
  freight_charges: nullableString,
  freight_currency: nullableString,
  insurance_charges: nullableString,
  insurance_currency: nullableString,
  other_charges: nullableString,
  other_charges_currency: nullableString,
  total_tax_amount: nullableString,
});

export const pageExtractionSchema = z.object({
  header: extractedHeaderSchema,
  header_evidence: headerEvidenceSchema,
  line_items: z.array(extractedLineItemSchema),
});

export type PageExtraction = z.infer<typeof pageExtractionSchema>;
export type { ExtractedPage };

const headerPropertyNames = [
  'invoice_number',
  'invoice_date',
  'seller_name',
  'seller_tax_id',
  'buyer_name',
  'buyer_tax_id',
  'buyer_iec',
  'currency',
  'total_invoice_value',
  'freight_charges',
  'freight_currency',
  'insurance_charges',
  'insurance_currency',
  'other_charges',
  'other_charges_currency',
  'total_tax_amount',
] as const;

const evidencePropertyNames = headerPropertyNames;

const nullableStringJson = { type: ['string', 'null'] };
const nullableBooleanJson = { type: ['boolean', 'null'] };

const headerProperties = Object.fromEntries(
  headerPropertyNames.map((name) => [name, nullableStringJson]),
) as Record<string, { type: string[] }>;

headerProperties.freight_included = nullableBooleanJson;
headerProperties.insurance_included = nullableBooleanJson;
headerProperties.other_charges_included = nullableBooleanJson;

const headerEvidenceProperties = Object.fromEntries(
  evidencePropertyNames.map((name) => [name, nullableStringJson]),
) as Record<string, { type: string[] }>;

const lineEvidenceProperties: Record<string, { type: string[] }> = {
  description: nullableStringJson,
  hsn_code: nullableStringJson,
  quantity: nullableStringJson,
  unit_of_measure: nullableStringJson,
  unit_price: nullableStringJson,
  total_line_amount: nullableStringJson,
  row_text: nullableStringJson,
};

export const invoicePageJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['header', 'header_evidence', 'line_items'],
  properties: {
    header: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(headerProperties),
      properties: headerProperties,
    },
    header_evidence: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(headerEvidenceProperties),
      properties: headerEvidenceProperties,
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'printed_row_number',
          'description',
          'hsn_code',
          'quantity',
          'unit_of_measure',
          'unit_price',
          'total_line_amount',
          'row_text',
          'evidence',
        ],
        properties: {
          printed_row_number: nullableStringJson,
          description: nullableStringJson,
          hsn_code: nullableStringJson,
          quantity: nullableStringJson,
          unit_of_measure: nullableStringJson,
          unit_price: nullableStringJson,
          total_line_amount: nullableStringJson,
          row_text: nullableStringJson,
          evidence: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(lineEvidenceProperties),
            properties: lineEvidenceProperties,
          },
        },
      },
    },
  },
} as const;

export const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});
