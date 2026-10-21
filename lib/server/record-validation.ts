import 'server-only';

import type { ConfidenceSource, InvoiceHeader, PageKind } from '@/lib/types';
import { appError } from './errors';

const CURRENCY_RE = /^[A-Z]{3}$/;
const HSN_RE = /^[0-9]{6,8}$/;
const PAGE_KINDS: PageKind[] = ['text', 'scan', 'image'];
const CONFIDENCE_SOURCES: ConfidenceSource[] = ['text_layer', 'ocr', 'none'];
const SEVERITIES = ['low', 'medium', 'high'] as const;
const MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

function invalid(message: string): never {
  throw appError(500, 'E_INVALID_DATA', message);
}

function validatePageNumber(value: number | null, label: string): void {
  if (value !== null && (!Number.isInteger(value) || value < 1)) {
    invalid(`${label} must be a positive whole number.`);
  }
}

function validateCurrency(value: string | null, label: string): void {
  if (value !== null && !CURRENCY_RE.test(value)) {
    invalid(`${label} must be a three-letter uppercase currency code.`);
  }
}

export function validateSourceDocument(row: { mimeType: string; byteSize: number }): void {
  if (!MIME_TYPES.includes(row.mimeType)) {
    invalid('Unsupported source document type.');
  }
  if (!Number.isInteger(row.byteSize) || row.byteSize < 1) {
    invalid('Source document size must be greater than zero.');
  }
}

export function validatePageCount(pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    invalid('Page count cannot be negative.');
  }
}

export function validatePageRecord(row: {
  pageNumber: number;
  sourceKind: PageKind;
}): void {
  validatePageNumber(row.pageNumber, 'Page number');
  if (!PAGE_KINDS.includes(row.sourceKind)) {
    invalid(`Page kind must be one of: ${PAGE_KINDS.join(', ')}.`);
  }
}

export function validateHeaderRecord(header: InvoiceHeader, otherChargesCurrency: string | null): void {
  validateCurrency(header.currency, 'Currency');
  validateCurrency(header.freight_currency, 'Freight currency');
  validateCurrency(header.insurance_currency, 'Insurance currency');
  validateCurrency(otherChargesCurrency, 'Other charges currency');
}

export function validateLineRecord(row: {
  lineNumber: number;
  pageNumber: number | null;
  hsnCode: string | null;
}): void {
  if (!Number.isInteger(row.lineNumber) || row.lineNumber < 1) {
    invalid('Line number must be a positive whole number.');
  }
  validatePageNumber(row.pageNumber, 'Line page number');
  if (row.hsnCode !== null && !HSN_RE.test(row.hsnCode)) {
    invalid(`HSN code "${row.hsnCode}" must contain 6 to 8 digits.`);
  }
}

export function validateConfidenceRecord(row: {
  score: number;
  page: number | null;
  source: ConfidenceSource;
}): void {
  if (!Number.isFinite(row.score) || row.score < 0 || row.score > 1) {
    invalid('Confidence score must be between 0 and 1.');
  }
  validatePageNumber(row.page, 'Confidence page number');
  if (!CONFIDENCE_SOURCES.includes(row.source)) {
    invalid(`Confidence source must be one of: ${CONFIDENCE_SOURCES.join(', ')}.`);
  }
}

export function validateIssueRecord(row: {
  severity: (typeof SEVERITIES)[number];
  page: number | null;
}): void {
  if (!SEVERITIES.includes(row.severity)) {
    invalid(`Issue severity must be one of: ${SEVERITIES.join(', ')}.`);
  }
  validatePageNumber(row.page, 'Issue page number');
}
