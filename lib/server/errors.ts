import 'server-only';

export type AppError = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function appError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  return { status, code, message, details };
}

export function isAppError(error: unknown): error is AppError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected server error';
}

function toBody(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

/**
 * Convert any thrown value into a safe response. Provider payloads, bearer
 * tokens, source bytes, and URLs never reach the browser or the logs.
 */
export function toErrorResponse(error: unknown): Response {
  if (isAppError(error)) {
    if (error.status >= 500) {
      console.error('[api] request failed', { code: error.code, status: error.status });
    }
    return Response.json(toBody(error), { status: error.status });
  }

  const message = errorMessage(error);
  console.error('[api] unhandled request failure', { message });
  return Response.json(
    toBody(appError(500, 'E_INTERNAL', 'The request could not be completed.')),
    { status: 500 },
  );
}

export function notFound(message = 'Invoice not found'): AppError {
  return appError(404, 'E_NOT_FOUND', message);
}

export function badRequest(message: string, details?: Record<string, unknown>): AppError {
  return appError(400, 'E_BAD_REQUEST', message, details);
}

export function conflict(message: string): AppError {
  return appError(409, 'E_CONFLICT', message);
}
