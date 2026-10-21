import 'server-only';

import axios from 'axios';
import FormData from 'form-data';
import type { PageKind, OcrWord } from '@/lib/types';
import { getServerEnv } from '@/lib/server/env';
import { appError } from '@/lib/server/errors';
import { docServiceResponseSchema } from './types';

export type DocServicePageResult = {
  page: number;
  kind: PageKind;
  widthPt: number | null;
  heightPt: number | null;
  imageWidth: number;
  imageHeight: number;
  words: OcrWord[];
  image: Buffer | null;
  error: string | null;
};

export type DocServiceResult = {
  pageCount: number;
  pages: DocServicePageResult[];
  elapsedMs: number;
};

const RETRY_DELAYS_MS = [5_000, 15_000];

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeDocument(input: {
  data: Buffer;
  filename: string;
  mimeType: string;
}): Promise<DocServiceResult> {
  const env = getServerEnv();
  const base = env.DOC_SERVICE_URL.replace(/\/+$/, '');

  const form = new FormData();
  form.append('file', input.data, {
    filename: input.filename,
    contentType: input.mimeType,
    knownLength: input.data.length,
  });

  let lastStatus: number | null = null;
  let lastNetworkError = false;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await axios.post(`${base}/analyze`, form, {
        params: { include_images: 'true' },
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${env.DOC_SERVICE_TOKEN}`,
        },
        timeout: 300_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      });

      lastStatus = response.status;
      if (response.status >= 200 && response.status < 300) {
        return normalizeResponse(response.data);
      }
      if (!retryableStatus(response.status)) {
        throw appError(
          502,
          'E_DOCSERVICE_REJECTED',
          `The document service rejected the request (HTTP ${response.status}).`,
        );
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        if (!retryableStatus(error.response.status)) {
          throw appError(
            502,
            'E_DOCSERVICE_REJECTED',
            `The document service rejected the request (HTTP ${error.response.status}).`,
          );
        }
        lastStatus = error.response.status;
      } else {
        lastNetworkError = true;
      }
    }

    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw appError(
    502,
    'E_DOCSERVICE_UNAVAILABLE',
    lastNetworkError
      ? 'The document service could not be reached.'
      : `The document service is unavailable (HTTP ${lastStatus ?? 'unknown'}).`,
  );
}

function normalizeResponse(body: unknown): DocServiceResult {
  const parsed = docServiceResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(502, 'E_DOCSERVICE_INVALID', 'The document service returned an invalid response.');
  }

  const data = parsed.data;
  if (data.page_count !== data.pages.length) {
    throw appError(502, 'E_DOCSERVICE_INVALID', 'The document service returned an inconsistent page count.');
  }

  const ordered = [...data.pages].sort((a, b) => a.page - b.page);
  ordered.forEach((page, index) => {
    if (page.page !== index + 1) {
      throw appError(502, 'E_DOCSERVICE_INVALID', 'The document service returned non-contiguous pages.');
    }
    for (const word of page.words) {
      if (word.x0 > word.x1 || word.y0 > word.y1) {
        throw appError(502, 'E_DOCSERVICE_INVALID', 'The document service returned an invalid word box.');
      }
    }
  });

  return {
    pageCount: data.page_count,
    elapsedMs: data.elapsed_ms,
    pages: ordered.map((page) => ({
      page: page.page,
      kind: page.kind,
      widthPt: page.width_pt,
      heightPt: page.height_pt,
      imageWidth: page.image_width,
      imageHeight: page.image_height,
      words: page.words,
      image: page.image_b64 ? Buffer.from(page.image_b64, 'base64') : null,
      error: page.error,
    })),
  };
}
