import 'server-only';

import type {
  ConfidenceData,
  Invoice,
  InvoiceHeader,
  InvoiceLineItem,
  InvoiceResult,
  InvoiceSummary,
  ValidationIssue,
} from '@/lib/types';
import { toDisplayStatus, toValidationIssue } from '@/lib/utils';
import type { DocumentHeader, DocumentLineItem } from '@/src/db/schema';
import type { InvoiceDetailRows } from './invoices';

export function documentName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '') || filename;
}

export function toInvoiceSummary(row: {
  id: string;
  sourceFile: string;
  status: DocumentHeader['status'];
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  totalInvoiceValue: string | null;
  createdAt: Date;
  updatedAt: Date;
  lineItemCount: number;
}): InvoiceSummary {
  return {
    id: row.id,
    sourceFilename: row.sourceFile,
    documentName: documentName(row.sourceFile),
    status: toDisplayStatus(row.status),
    machineStatus: row.status,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    currency: row.currency,
    totalInvoiceValue: row.totalInvoiceValue,
    lineItemCount: Number(row.lineItemCount ?? 0),
    lastUpdated: row.updatedAt.toISOString(),
  };
}

function headerFromRow(header: DocumentHeader): InvoiceHeader {
  return {
    source_file: header.sourceFile,
    invoice_number: header.invoiceNumber,
    invoice_date: header.invoiceDate,
    seller_name: header.sellerName,
    seller_tax_id: header.sellerTaxId,
    buyer_name: header.buyerName,
    buyer_tax_id: header.buyerTaxId,
    buyer_iec: header.buyerIec,
    currency: header.currency,
    total_invoice_value: header.totalInvoiceValue,
    freight_charges: header.freightCharges,
    freight_currency: header.freightCurrency,
    insurance_charges: header.insuranceCharges,
    insurance_currency: header.insuranceCurrency,
    other_charges: header.otherCharges,
    total_tax_amount: header.totalTaxAmount,
  };
}

function lineFromRow(line: DocumentLineItem): InvoiceLineItem {
  return {
    line_number: line.lineNumber,
    item_description: line.itemDescription,
    hsn_code: line.hsnCode,
    quantity: line.quantity,
    unit_of_measure: line.unitOfMeasure,
    uom_as_printed: line.uomAsPrinted,
    unit_price: line.unitPrice,
    total_line_amount: line.totalLineAmount,
  };
}

function confidenceFromRows(rows: InvoiceDetailRows): ConfidenceData {
  const confidence: ConfidenceData = {};
  for (const row of rows.confidences) {
    const key = row.lineNumber === null ? row.field : `${row.field}_${row.lineNumber}`;
    confidence[key] = {
      value: row.normalizedValue,
      rawText: row.rawValue,
      normalizedValue:
        row.normalizedValue !== null && row.normalizedValue !== row.rawValue
          ? row.normalizedValue
          : null,
      confidence: Number(row.score),
      source: row.page !== null && row.bbox ? { page: row.page, bbox: row.bbox } : null,
      evidence: row.evidence,
    };
  }
  return confidence;
}

function issuesFromRows(rows: InvoiceDetailRows): ValidationIssue[] {
  const issues: ValidationIssue[] = rows.issues.map((row, index) =>
    toValidationIssue(
      {
        code: row.code as never,
        severity: row.severity,
        message: row.message,
        field: row.field,
        lineNumber: row.lineNumber,
        expected: row.expected,
        actual: row.actual,
        page: row.page,
        bbox: row.bbox,
      },
      index,
    ),
  );

  if (rows.header.error && rows.header.status === 'failed') {
    issues.push(
      toValidationIssue(
        {
          code: 'E_PAGE_FAILED',
          severity: 'high',
          message: `Processing failed: ${rows.header.error}`,
          page: null,
          bbox: null,
        },
        issues.length,
      ),
    );
  }

  return issues;
}

export function toInvoiceDetail(rows: InvoiceDetailRows): Invoice {
  const header = rows.header;
  const summary = toInvoiceSummary({
    id: header.id,
    sourceFile: header.sourceFile,
    status: header.status,
    invoiceNumber: header.invoiceNumber,
    invoiceDate: header.invoiceDate,
    currency: header.currency,
    totalInvoiceValue: header.totalInvoiceValue,
    createdAt: header.createdAt,
    updatedAt: header.updatedAt,
    lineItemCount: rows.lines.length,
  });

  const result: InvoiceResult = {
    document: summary.documentName,
    header: headerFromRow(header),
    line_items: rows.lines.map(lineFromRow),
    is_arithmetic_valid: header.isArithmeticValid,
    needs_review: header.needsReview,
    review_reasons: header.reviewReasons ?? [],
    confidence: confidenceFromRows(rows),
    validation_issues: issuesFromRows(rows),
  };

  return {
    ...summary,
    pageCount: header.pageCount,
    pages: rows.pages.map((page) => ({
      page: page.pageNumber,
      imageUrl: `/api/invoices/${header.id}/pages/${page.pageNumber}/image`,
      width: page.imageWidth,
      height: page.imageHeight,
    })),
    result,
    reconciliation: header.reconciliation,
    processingError: header.error,
    createdAt: header.createdAt.toISOString(),
  };
}
