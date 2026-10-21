import 'server-only';

import type { InvoiceMachineStatus, OcrWord, PageKind } from '@/lib/types';
import { buildNormalizedInvoice, type SourcePage } from '@/lib/utils';
import { getServerEnv } from './env';
import { isAppError } from './errors';
import {
  claimInvoiceForProcessing,
  completeInvoice,
  failInvoice,
  getInvoiceSource,
  loadStoredPages,
  savePageArtifacts,
  savePageRawModel,
} from './invoices';
import { analyzeDocument } from './modal/doc-service';
import { PROMPT_VERSION } from './extraction-prompt';
import { extractInvoicePage } from './modal/vlm';
import { pageExtractionSchema } from './modal/types';

export type ProcessInvoiceResult =
  | { outcome: 'not_found' }
  | { outcome: 'busy' }
  | { outcome: 'terminal'; status: InvoiceMachineStatus }
  | { outcome: 'completed'; status: 'succeeded' | 'needs_review' }
  | { outcome: 'failed'; error: string };

type PageWork = SourcePage & {
  image: Buffer | null;
  raw: Record<string, unknown> | null;
};

function textHintFromWords(words: OcrWord[]): string | null {
  if (words.length === 0) return null;

  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Array<{ y: number; words: OcrWord[] }> = [];
  for (const word of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - word.y0) <= 0.008) {
      line.words.push(word);
    } else {
      lines.push({ y: word.y0, words: [word] });
    }
  }

  const text = lines
    .map((line) =>
      [...line.words]
        .sort((a, b) => a.x0 - b.x0)
        .map((word) => word.text)
        .join(' '),
    )
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text ? text.slice(0, 6000) : null;
}

function cachedExtraction(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  if (raw._prompt_version !== PROMPT_VERSION) return null;
  const parsed = pageExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function safeProviderMessage(error: unknown): string {
  return isAppError(error) ? error.message : 'The model service could not read this page.';
}

export async function processInvoice(id: string): Promise<ProcessInvoiceResult> {
  const claim = await claimInvoiceForProcessing(id);
  if (!claim.claimed) {
    if (claim.kind === 'not_found') return { outcome: 'not_found' };
    if (claim.kind === 'busy') return { outcome: 'busy' };
    return { outcome: 'terminal', status: claim.header?.status ?? 'succeeded' };
  }

  const startedAt = new Date();
  let sourceSha: string | null = null;

  try {
    const source = await getInvoiceSource(id);
    if (!source) {
      await failInvoice(id, 'The uploaded file could not be found.');
      return { outcome: 'failed', error: 'The uploaded file could not be found.' };
    }
    sourceSha = source.sha256;

    const stored = await loadStoredPages(id);
    const canReuse =
      stored.length > 0 &&
      stored.every((page) => page.pngData !== null && page.pageError === null);

    let pages: PageWork[] = [];
    let docServiceMs = 0;

    if (canReuse) {
      pages = stored.map((page) => ({
        page: page.pageNumber,
        kind: page.sourceKind,
        words: page.ocrWords,
        extraction: cachedExtraction(page.rawModelJson),
        error: page.pageError,
        image: page.pngData,
        raw: page.rawModelJson,
      }));
    } else {
      const analyzed = await analyzeDocument({
        data: source.data,
        filename: source.filename,
        mimeType: source.mimeType as 'application/pdf' | 'image/png' | 'image/jpeg',
      });
      docServiceMs = analyzed.elapsedMs;

      await savePageArtifacts(
        id,
        analyzed.pages.map((page) => ({
          page: page.page,
          kind: page.kind as PageKind,
          pngData: page.image,
          imageWidth: page.imageWidth,
          imageHeight: page.imageHeight,
          ocrWords: page.words,
          pageError: page.error,
        })),
      );

      pages = analyzed.pages.map((page) => ({
        page: page.page,
        kind: page.kind as PageKind,
        words: page.words,
        extraction: null,
        error: page.error ?? (page.image ? null : 'The page image could not be rendered.'),
        image: page.image,
        raw: null,
      }));
    }

    const vlmStartedAt = Date.now();

    for (const page of pages) {
      if (page.extraction) continue;
      if (!page.image) {
        page.error ??= 'The page image is unavailable.';
        continue;
      }

      try {
        const result = await extractInvoicePage({
          imagePng: page.image,
          textHint: textHintFromWords(page.words),
        });
        page.extraction = result.extraction;
        page.raw = { ...result.raw, _prompt_version: PROMPT_VERSION };
        await savePageRawModel(id, page.page, page.raw);
        if (!result.extraction) {
          page.error = 'The model returned unusable structured data for this page.';
        }
      } catch (error) {
        page.error = safeProviderMessage(error);
      }
    }

    const readable = pages.filter((page) => page.extraction !== null);
    if (readable.length === 0) {
      const message = 'No page could be read. The document can be retried.';
      await failInvoice(id, message);
      return { outcome: 'failed', error: message };
    }

    const normalized = buildNormalizedInvoice({
      sourceFile: source.filename,
      pages,
      reviewThreshold: getServerEnv().REVIEW_THRESHOLD,
    });

    const finishedAt = new Date();
    await completeInvoice(id, normalized, {
      pageCount: pages.length,
      readablePages: readable.length,
      failedPages: pages.length - readable.length,
      reusedPages: canReuse ? pages.length : 0,
      docServiceMs,
      vlmMs: finishedAt.getTime() - vlmStartedAt,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      sourceSha256: sourceSha,
    });

    return {
      outcome: 'completed',
      status: normalized.needsReview ? 'needs_review' : 'succeeded',
    };
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : 'Processing failed unexpectedly. The document can be retried.';
    await failInvoice(id, message);
    return { outcome: 'failed', error: message };
  }
}
