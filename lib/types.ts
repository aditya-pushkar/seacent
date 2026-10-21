/**
 * Shared, client-safe domain types. Machine statuses are persisted; display
 * statuses are what the UI renders. All money/quantity values are decimal
 * strings so JavaScript floating point never touches domain amounts.
 */

export type InvoiceMachineStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'needs_review'
  | 'failed'
  | 'rejected';

export type InvoiceStatus =
  | 'Queued'
  | 'Processing'
  | 'Succeeded'
  | 'Needs review'
  | 'Failed'
  | 'Rejected';

export type Bbox = [number, number, number, number];

export type FieldSourceLocation = {
  page: number;
  bbox: Bbox;
};

export type PageKind = 'text' | 'scan' | 'image';

export type ConfidenceSource = 'text_layer' | 'ocr' | 'none';

export type OcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  conf: number;
  source: 'text_layer' | 'ocr';
};

export type FieldMetadata = {
  value?: string | null;
  rawText?: string | null;
  normalizedValue?: string | null;
  confidence?: number | null;
  source?: FieldSourceLocation | null;
  evidence?: string | null;
};

export type InvoiceHeader = {
  source_file: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  buyer_iec: string | null;
  currency: string | null;
  total_invoice_value: string | null;
  freight_charges: string | null;
  freight_currency: string | null;
  insurance_charges: string | null;
  insurance_currency: string | null;
  other_charges: string | null;
  total_tax_amount: string | null;
};

export type InvoiceLineItem = {
  line_number: number | null;
  item_description: string | null;
  hsn_code: string | null;
  quantity: string | null;
  unit_of_measure: string | null;
  uom_as_printed: string | null;
  unit_price: string | null;
  total_line_amount: string | null;
};

export type ValidationIssueType =
  | 'arithmetic_mismatch'
  | 'low_confidence'
  | 'missing_field'
  | 'ambiguous_text'
  | 'currency_mismatch'
  | 'processing_failure'
  | 'missing_provenance'
  | 'other';

export type ValidationIssue = {
  id: string;
  code: string;
  type: ValidationIssueType;
  severity: 'low' | 'medium' | 'high';
  message: string;
  fieldName?: string | null;
  lineNumber?: number | null;
  expected?: string | null;
  actual?: string | null;
  source?: FieldSourceLocation | null;
};

export type ConfidenceData = Record<string, FieldMetadata>;

export type Reconciliation = {
  status: 'valid' | 'mismatch' | 'incomplete';
  lineSum: string | null;
  chargeSum: string | null;
  taxAmount: string | null;
  expectedTotal: string | null;
  printedTotal: string | null;
  delta: string | null;
  tolerance: string | null;
  includedCharges: string[];
  excludedCharges: string[];
  lineMismatchCount?: number;
  lineIncompleteCount?: number;
  message: string;
};

export type InvoiceResult = {
  document: string;
  header: InvoiceHeader;
  line_items: InvoiceLineItem[];
  is_arithmetic_valid: boolean;
  needs_review: boolean;
  review_reasons: string[];
  confidence: ConfidenceData;
  validation_issues: ValidationIssue[];
};

export type InvoicePage = {
  page: number;
  imageUrl: string;
  width: number | null;
  height: number | null;
};

export type InvoiceSummary = {
  id: string;
  sourceFilename: string;
  documentName: string;
  status: InvoiceStatus;
  machineStatus: InvoiceMachineStatus;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  totalInvoiceValue: string | null;
  lineItemCount: number;
  lastUpdated: string;
};

export type Invoice = InvoiceSummary & {
  pageCount: number;
  pages: InvoicePage[];
  result: InvoiceResult;
  reconciliation: Reconciliation | null;
  processingError: string | null;
  createdAt: string;
};

export type InvoiceListResponse = {
  invoices: InvoiceSummary[];
};

export type InvoiceDetailResponse = {
  invoice: Invoice;
};

/** Raw VLM output shape (validated before it reaches this type). */
export type ExtractedHeader = {
  invoice_number: string | null;
  invoice_date: string | null;
  seller_name: string | null;
  seller_tax_id: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  buyer_iec: string | null;
  currency: string | null;
  total_invoice_value: string | null;
  freight_charges: string | null;
  freight_currency: string | null;
  freight_included: boolean | null;
  insurance_charges: string | null;
  insurance_currency: string | null;
  insurance_included: boolean | null;
  other_charges: string | null;
  other_charges_currency: string | null;
  other_charges_included: boolean | null;
  total_tax_amount: string | null;
};

export type ExtractedLineItem = {
  printed_row_number: string | null;
  description: string | null;
  hsn_code: string | null;
  quantity: string | null;
  unit_of_measure: string | null;
  unit_price: string | null;
  total_line_amount: string | null;
  row_text: string | null;
  evidence: Record<string, string | null>;
};

export type ExtractedPage = {
  header: ExtractedHeader;
  header_evidence: Record<string, string | null>;
  line_items: ExtractedLineItem[];
};

export type IssueCode =
  | 'E_MODEL_INVALID'
  | 'E_NOT_GROUNDED'
  | 'E_BAD_DECIMAL'
  | 'E_BAD_DATE'
  | 'E_ARITH_LINE'
  | 'E_ARITH_TOTAL'
  | 'E_ARITH_INCOMPLETE'
  | 'E_PAGE_FAILED'
  | 'W_AMBIGUOUS_NUMBER'
  | 'W_AMBIGUOUS_DATE'
  | 'W_CROSS_CURRENCY_CHARGE'
  | 'W_CHARGE_INCLUSION_UNKNOWN'
  | 'W_CURRENCY_CONFLICT'
  | 'W_LOW_CONFIDENCE'
  | 'W_MISSING_FIELD'
  | 'W_UNKNOWN_UOM'
  | 'W_HSN_UNSUPPORTED_LENGTH'
  | 'W_HSN_INVALID'
  | 'W_AMBIGUOUS_CURRENCY'
  | 'W_DUPLICATE_ROW';

export type IssueDraft = {
  code: IssueCode;
  severity: 'low' | 'medium' | 'high';
  message: string;
  field?: string | null;
  lineNumber?: number | null;
  expected?: string | null;
  actual?: string | null;
  page?: number | null;
  bbox?: Bbox | null;
};

/** Field confidence as persisted: components are inputs, not a model self-score. */
export type FieldConfidence = {
  field: string;
  lineNumber: number | null;
  score: number;
  rawValue: string | null;
  normalizedValue: string | null;
  evidence: string | null;
  page: number | null;
  bbox: Bbox | null;
  source: ConfidenceSource;
  components: {
    grounding: number;
    source: number;
    validation: number;
  };
};
