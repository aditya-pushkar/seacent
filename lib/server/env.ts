import 'server-only';

import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  DOC_SERVICE_URL: z.url(),
  DOC_SERVICE_TOKEN: z.string().min(1),
  LLM_BASE_URL: z.url(),
  LLM_MODEL: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
  REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
  PROCESSING_STALE_MINUTES: z.coerce.number().int().positive().default(30),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

/**
 * Parse and cache server configuration on first request. Keeping this out of
 * module evaluation means `next build`/`tsc` do not need a populated .env.
 */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'env').join(', ');
    throw new Error(`Invalid server environment: ${fields}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
