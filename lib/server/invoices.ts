import 'server-only';

import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/src/db';
import {
  documentHeaders,
  documentLineItems,
  documentPages,
  fieldConfidences,
  sourceDocuments,
  validationIssues,
  type DocumentHeader,
  type DocumentLineItem,
  type FieldConfidenceRow,
  type ValidationIssueRow,
} from '@/src/db/schema';
import type { OcrWord, PageKind } from '@/lib/types';
import type { NormalizedInvoice } from '@/lib/utils';
import { getServerEnv } from './env';
import {
  validateConfidenceRecord,
  validateHeaderRecord,
  validateIssueRecord,
  validateLineRecord,
  validatePageCount,
  validatePageRecord,
  validateSourceDocument,
} from './record-validation';
import type { ValidatedUpload } from './upload';

export type PageSummaryRow = {
  pageNumber: number;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type StoredPageRow = {
  pageNumber: number;
  sourceKind: PageKind;
  pngData: Buffer | null;
  imageWidth: number | null;
  imageHeight: number | null;
  ocrWords: OcrWord[];
  pageError: string | null;
  rawModelJson: Record<string, unknown> | null;
};

export type InvoiceDetailRows = {
  header: DocumentHeader;
  pages: PageSummaryRow[];
  lines: DocumentLineItem[];
  confidences: FieldConfidenceRow[];
  issues: ValidationIssueRow[];
};

export type ClaimResult =
  | { claimed: true; header: DocumentHeader }
  | { claimed: false; kind: 'not_found' | 'busy' | 'terminal'; header: DocumentHeader | null };

export async function createQueuedInvoice(upload: ValidatedUpload): Promise<string> {
  validateSourceDocument(upload);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [header] = await tx
      .insert(documentHeaders)
      .values({
        sourceFile: upload.filename,
        sourceSha256: upload.sha256,
        status: 'queued',
      })
      .returning({ id: documentHeaders.id });

    await tx.insert(sourceDocuments).values({
      headerId: header.id,
      originalFilename: upload.filename,
      mimeType: upload.mimeType,
      data: upload.data,
      byteSize: upload.byteSize,
      sha256: upload.sha256,
    });

    return header.id;
  });
}

export async function listInvoiceSummaries() {
  const db = getDb();
  return db
    .select({
      id: documentHeaders.id,
      sourceFile: documentHeaders.sourceFile,
      status: documentHeaders.status,
      invoiceNumber: documentHeaders.invoiceNumber,
      invoiceDate: documentHeaders.invoiceDate,
      currency: documentHeaders.currency,
      totalInvoiceValue: documentHeaders.totalInvoiceValue,
      createdAt: documentHeaders.createdAt,
      updatedAt: documentHeaders.updatedAt,
      lineItemCount: sql<number>`(
        select count(*)::int from ${documentLineItems}
        where ${sql.raw('"document_line_items"."header_id"')}
          = ${sql.raw('"document_headers"."id"')}
      )`,
    })
    .from(documentHeaders)
    .orderBy(desc(documentHeaders.createdAt));
}

export async function getInvoiceDetailRows(id: string): Promise<InvoiceDetailRows | null> {
  const db = getDb();
  const [header] = await db
    .select()
    .from(documentHeaders)
    .where(eq(documentHeaders.id, id))
    .limit(1);
  if (!header) return null;

  const [pages, lines, confidences, issues] = await Promise.all([
    db
      .select({
        pageNumber: documentPages.pageNumber,
        imageWidth: documentPages.imageWidth,
        imageHeight: documentPages.imageHeight,
      })
      .from(documentPages)
      .where(eq(documentPages.headerId, id))
      .orderBy(documentPages.pageNumber),
    db
      .select()
      .from(documentLineItems)
      .where(eq(documentLineItems.headerId, id))
      .orderBy(documentLineItems.lineNumber),
    db
      .select()
      .from(fieldConfidences)
      .where(eq(fieldConfidences.headerId, id))
      .orderBy(fieldConfidences.lineNumber, fieldConfidences.field),
    db
      .select()
      .from(validationIssues)
      .where(eq(validationIssues.headerId, id))
      .orderBy(validationIssues.createdAt),
  ]);

  return { header, pages, lines, confidences, issues };
}

export async function getInvoiceSource(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      data: sourceDocuments.data,
      filename: sourceDocuments.originalFilename,
      mimeType: sourceDocuments.mimeType,
      sha256: sourceDocuments.sha256,
    })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.headerId, id))
    .limit(1);
  return row ?? null;
}

export async function getPageImage(id: string, pageNumber: number): Promise<Buffer | null> {
  const db = getDb();
  const [row] = await db
    .select({ data: documentPages.pngData })
    .from(documentPages)
    .where(and(eq(documentPages.headerId, id), eq(documentPages.pageNumber, pageNumber)))
    .limit(1);
  return row?.data ?? null;
}

export async function claimInvoiceForProcessing(id: string): Promise<ClaimResult> {
  const env = getServerEnv();
  const cutoff = new Date(Date.now() - env.PROCESSING_STALE_MINUTES * 60_000);
  const db = getDb();

  const [claimed] = await db
    .update(documentHeaders)
    .set({
      status: 'processing',
      processingStartedAt: new Date(),
      processingFinishedAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentHeaders.id, id),
        or(
          inArray(documentHeaders.status, ['queued', 'failed']),
          and(
            eq(documentHeaders.status, 'processing'),
            lt(documentHeaders.processingStartedAt, cutoff),
          ),
        ),
      ),
    )
    .returning();

  if (claimed) return { claimed: true, header: claimed };

  const [existing] = await db
    .select()
    .from(documentHeaders)
    .where(eq(documentHeaders.id, id))
    .limit(1);
  if (!existing) return { claimed: false, kind: 'not_found', header: null };
  if (existing.status === 'processing') return { claimed: false, kind: 'busy', header: existing };
  return { claimed: false, kind: 'terminal', header: existing };
}

export async function savePageArtifacts(
  headerId: string,
  pages: Array<{
    page: number;
    kind: PageKind;
    pngData: Buffer | null;
    imageWidth: number | null;
    imageHeight: number | null;
    ocrWords: OcrWord[];
    pageError: string | null;
  }>,
): Promise<void> {
  validatePageCount(pages.length);
  for (const page of pages) {
    validatePageRecord({ pageNumber: page.page, sourceKind: page.kind });
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(documentPages).where(eq(documentPages.headerId, headerId));
    if (pages.length > 0) {
      await tx.insert(documentPages).values(
        pages.map((page) => ({
          headerId,
          pageNumber: page.page,
          sourceKind: page.kind,
          pngData: page.pngData,
          imageWidth: page.imageWidth,
          imageHeight: page.imageHeight,
          ocrWords: page.ocrWords,
          pageError: page.pageError,
        })),
      );
    }
    await tx
      .update(documentHeaders)
      .set({ pageCount: pages.length, updatedAt: new Date() })
      .where(eq(documentHeaders.id, headerId));
  });
}

export async function loadStoredPages(headerId: string): Promise<StoredPageRow[]> {
  const db = getDb();
  return db
    .select({
      pageNumber: documentPages.pageNumber,
      sourceKind: documentPages.sourceKind,
      pngData: documentPages.pngData,
      imageWidth: documentPages.imageWidth,
      imageHeight: documentPages.imageHeight,
      ocrWords: documentPages.ocrWords,
      pageError: documentPages.pageError,
      rawModelJson: documentPages.rawModelJson,
    })
    .from(documentPages)
    .where(eq(documentPages.headerId, headerId))
    .orderBy(documentPages.pageNumber);
}

export async function savePageRawModel(
  headerId: string,
  pageNumber: number,
  raw: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db
    .update(documentPages)
    .set({ rawModelJson: raw })
    .where(
      and(eq(documentPages.headerId, headerId), eq(documentPages.pageNumber, pageNumber)),
    );
}

export async function completeInvoice(
  headerId: string,
  normalized: NormalizedInvoice,
  meta: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const header = normalized.header;
  const now = new Date();
  const status = normalized.needsReview ? 'needs_review' : 'succeeded';

  validateHeaderRecord(header, normalized.chargeFlags.otherChargesCurrency);
  normalized.lineItems.forEach((item, index) => {
    validateLineRecord({
      lineNumber: index + 1,
      pageNumber: normalized.lineRows[index]?.pageNumber ?? null,
      hsnCode: item.hsn_code,
    });
  });
  for (const row of normalized.confidences) {
    validateConfidenceRecord({ score: row.score, page: row.page, source: row.source });
  }
  for (const row of normalized.issues) {
    validateIssueRecord({ severity: row.severity, page: row.page ?? null });
  }

  await db.transaction(async (tx) => {
    await tx.delete(validationIssues).where(eq(validationIssues.headerId, headerId));
    await tx.delete(fieldConfidences).where(eq(fieldConfidences.headerId, headerId));
    await tx.delete(documentLineItems).where(eq(documentLineItems.headerId, headerId));

    await tx
      .update(documentHeaders)
      .set({
        status,
        invoiceNumber: header.invoice_number,
        invoiceDate: header.invoice_date,
        sellerName: header.seller_name,
        sellerTaxId: header.seller_tax_id,
        buyerName: header.buyer_name,
        buyerTaxId: header.buyer_tax_id,
        buyerIec: header.buyer_iec,
        currency: header.currency,
        totalInvoiceValue: header.total_invoice_value,
        freightCharges: header.freight_charges,
        freightCurrency: header.freight_currency,
        freightIncluded: normalized.chargeFlags.freightIncluded,
        insuranceCharges: header.insurance_charges,
        insuranceCurrency: header.insurance_currency,
        insuranceIncluded: normalized.chargeFlags.insuranceIncluded,
        otherCharges: header.other_charges,
        otherChargesCurrency: normalized.chargeFlags.otherChargesCurrency,
        otherChargesIncluded: normalized.chargeFlags.otherChargesIncluded,
        totalTaxAmount: header.total_tax_amount,
        isArithmeticValid: normalized.isArithmeticValid,
        needsReview: normalized.needsReview,
        reviewReasons: normalized.reviewReasons,
        reconciliation: normalized.reconciliation,
        processingFinishedAt: now,
        processingMeta: meta,
        error: null,
        updatedAt: now,
      })
      .where(eq(documentHeaders.id, headerId));

    if (normalized.lineItems.length > 0) {
      await tx.insert(documentLineItems).values(
        normalized.lineItems.map((item, index) => ({
          headerId,
          lineNumber: index + 1,
          pageNumber: normalized.lineRows[index]?.pageNumber ?? null,
          rowBbox: normalized.lineRows[index]?.rowBbox ?? null,
          itemDescription: item.item_description,
          hsnCode: item.hsn_code,
          quantity: item.quantity,
          unitOfMeasure: item.unit_of_measure,
          uomAsPrinted: item.uom_as_printed,
          unitPrice: item.unit_price,
          totalLineAmount: item.total_line_amount,
          flags: normalized.lineRows[index]?.flags ?? [],
        })),
      );
    }

    if (normalized.confidences.length > 0) {
      await tx.insert(fieldConfidences).values(
        normalized.confidences.map((row) => ({
          headerId,
          lineNumber: row.lineNumber,
          field: row.field,
          score: row.score.toFixed(3),
          rawValue: row.rawValue,
          normalizedValue: row.normalizedValue,
          evidence: row.evidence,
          page: row.page,
          bbox: row.bbox,
          source: row.source,
          components: row.components,
        })),
      );
    }

    if (normalized.issues.length > 0) {
      await tx.insert(validationIssues).values(
        normalized.issues.map((row) => ({
          headerId,
          code: row.code,
          severity: row.severity,
          message: row.message,
          field: row.field ?? null,
          lineNumber: row.lineNumber ?? null,
          expected: row.expected ?? null,
          actual: row.actual ?? null,
          page: row.page ?? null,
          bbox: row.bbox ?? null,
        })),
      );
    }
  });
}

export async function failInvoice(headerId: string, message: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(documentHeaders)
    .set({
      status: 'failed',
      error: message.slice(0, 2000),
      needsReview: false,
      processingFinishedAt: now,
      updatedAt: now,
    })
    .where(eq(documentHeaders.id, headerId));
}

export async function findReusableInvoiceBySha256(sha256: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: documentHeaders.id, status: documentHeaders.status })
    .from(documentHeaders)
    .where(eq(documentHeaders.sourceSha256, sha256))
    .orderBy(desc(documentHeaders.createdAt))
    .limit(1);
  if (!row) return null;
  return row.status === 'succeeded' || row.status === 'needs_review' ? row : null;
}
