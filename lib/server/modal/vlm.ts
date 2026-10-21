import 'server-only';

import axios from 'axios';
import type { ExtractedPage } from '@/lib/types';
import { getServerEnv } from '@/lib/server/env';
import { appError } from '@/lib/server/errors';
import {
  SYSTEM_PROMPT,
  buildReducedHint,
  buildUserText,
} from '@/lib/server/extraction-prompt';
import {
  chatCompletionSchema,
  invoicePageJsonSchema,
  pageExtractionSchema,
} from './types';

export type VlmPageResult = {
  extraction: ExtractedPage | null;
  finishReason: string | null;
  raw: Record<string, unknown>;
};

const RETRY_DELAYS_MS = [5_000, 20_000];
const MAX_TOKENS = 8192;
const COLD_START_TIMEOUT_MS = 240_000;

let vlmReady = false;
let readinessPromise: Promise<boolean> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

type RequestOutcome =
  | { ok: true; body: unknown }
  | { ok: false; status: number | null; rejectedFormat: boolean };

async function postChat(
  url: string,
  payload: Record<string, unknown>,
  apiKey?: string,
): Promise<RequestOutcome> {
  let lastStatus: number | null = null;
  const rejectedFormat = false;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: 300_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      });

      lastStatus = response.status;
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, body: response.data };
      }
      if (response.status === 400) {
        return { ok: false, status: 400, rejectedFormat: true };
      }
      if (!retryableStatus(response.status)) {
        return { ok: false, status: response.status, rejectedFormat };
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        lastStatus = error.response.status;
        if (error.response.status === 400) {
          return { ok: false, status: 400, rejectedFormat: true };
        }
        if (!retryableStatus(error.response.status)) {
          return { ok: false, status: error.response.status, rejectedFormat };
        }
      }
    }

    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  if (lastStatus !== null && lastStatus >= 500) vlmReady = false;
  return { ok: false, status: lastStatus, rejectedFormat };
}

function payloadFor(input: {
  imagePng: Buffer;
  textHint: string | null;
  responseFormat: Record<string, unknown>;
  model: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${input.imagePng.toString('base64')}` },
          },
          { type: 'text', text: buildUserText(input.textHint) },
        ],
      },
    ],
    response_format: input.responseFormat,
  };
}

const JSON_SCHEMA_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'invoice_page',
    schema: invoicePageJsonSchema,
    strict: true,
  },
};

const JSON_OBJECT_FORMAT = { type: 'json_object' };

function contentToString(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

function stripFences(text: string): string {
  let value = text.trim();
  if (!value.startsWith('```')) return value;
  value = value.split('\n').slice(1).join('\n');
  if (value.trimEnd().endsWith('```')) value = value.trimEnd().slice(0, -3);
  return value.trim();
}

function parseExtraction(content: string): { extraction: ExtractedPage | null; raw: Record<string, unknown>; finishReason: string | null } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripFences(content));
  } catch {
    return { extraction: null, raw: { raw_content: content.slice(0, 20_000) }, finishReason: null };
  }

  const parsed = pageExtractionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      extraction: null,
      raw: {
        raw_content: content.slice(0, 20_000),
        schema_issues: parsed.error.issues.slice(0, 10).map((entry) => ({
          path: entry.path.join('.'),
          message: entry.message,
        })),
      },
      finishReason: null,
    };
  }

  return { extraction: parsed.data as ExtractedPage, raw: parsed.data as unknown as Record<string, unknown>, finishReason: null };
}

export async function extractInvoicePage(input: {
  imagePng: Buffer;
  textHint: string | null;
}): Promise<VlmPageResult> {
  const env = getServerEnv();
  const url = chatUrl(env.LLM_BASE_URL);

  if (!(await ensureVlmReady())) {
    throw appError(502, 'E_VLM_UNAVAILABLE', 'The model service did not become ready in time.');
  }

  const attempt = async (
    textHint: string | null,
    format: Record<string, unknown>,
  ): Promise<{ result: VlmPageResult | null; formatRejected: boolean; fatalStatus: number | null }> => {
    const outcome = await postChat(
      url,
      payloadFor({
        imagePng: input.imagePng,
        textHint,
        responseFormat: format,
        model: env.LLM_MODEL,
      }),
      env.LLM_API_KEY,
    );

    if (!outcome.ok) {
      return {
        result: null,
        formatRejected: outcome.rejectedFormat,
        fatalStatus: outcome.status,
      };
    }

    const response = chatCompletionSchema.safeParse(outcome.body);
    if (!response.success) {
      return { result: null, formatRejected: false, fatalStatus: null };
    }

    const choice = response.data.choices[0];
    const finishReason = choice.finish_reason ?? null;
    const content = contentToString(choice.message.content);
    const parsed = parseExtraction(content);

    if (parsed.extraction && finishReason !== 'length') {
      return {
        result: {
          extraction: parsed.extraction,
          finishReason,
          raw: parsed.raw,
        },
        formatRejected: false,
        fatalStatus: null,
      };
    }

    return {
      result: {
        extraction: null,
        finishReason,
        raw: {
          ...parsed.raw,
          finish_reason: finishReason,
        },
      },
      formatRejected: false,
      fatalStatus: null,
    };
  };

  let first = await attempt(input.textHint, JSON_SCHEMA_FORMAT);

  if (!first.result && first.fatalStatus !== null && first.fatalStatus >= 500) {
    if (await ensureVlmReady()) {
      first = await attempt(input.textHint, JSON_SCHEMA_FORMAT);
    }
  }

  if (first.result) {
    if (first.result.extraction) return first.result;
    // Invalid model output: one retry with a reduced hint, as required.
    const retry = await attempt(buildReducedHint(input.textHint), JSON_SCHEMA_FORMAT);
    if (retry.result?.extraction) return retry.result;
    return retry.result ?? first.result;
  }

  if (first.formatRejected) {
    const fallback = await attempt(input.textHint, JSON_OBJECT_FORMAT);
    if (fallback.result?.extraction) return fallback.result;
    if (fallback.result) {
      const retry = await attempt(buildReducedHint(input.textHint), JSON_OBJECT_FORMAT);
      if (retry.result?.extraction) return retry.result;
      return retry.result ?? fallback.result;
    }
    if (fallback.fatalStatus !== null) {
      throw appError(502, 'E_VLM_UNAVAILABLE', `The model service returned HTTP ${fallback.fatalStatus}.`);
    }
  }

  throw appError(
    502,
    'E_VLM_UNAVAILABLE',
    first.fatalStatus === null
      ? 'The model service returned an unusable response.'
      : `The model service returned HTTP ${first.fatalStatus}.`,
  );
}

/** Trigger/wait out a cold start without spending a full generation. */
export async function warmVlm(timeoutMs = COLD_START_TIMEOUT_MS): Promise<boolean> {
  const env = getServerEnv();
  const base = env.LLM_BASE_URL.replace(/\/+$/, '');
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;

  while (Date.now() < deadline) {
    try {
      const response = await axios.get(`${base}/models`, {
        headers: { ...(env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {}) },
        timeout: 30_000,
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        vlmReady = true;
        return true;
      }
    } catch {
      // The service is still starting; keep polling.
    }
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.5), 15_000);
  }

  return false;
}

async function ensureVlmReady(): Promise<boolean> {
  if (vlmReady) return true;
  if (!readinessPromise) {
    readinessPromise = warmVlm().then((ready) => {
      vlmReady = ready;
      readinessPromise = null;
      return ready;
    });
  }
  return readinessPromise;
}
