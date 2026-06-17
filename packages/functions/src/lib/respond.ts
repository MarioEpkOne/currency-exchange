import { AppError, internalError } from '@currency/core';

/** Allowed origins for CORS (allowlist, never wildcard for the API). */
const ALLOWED_ORIGINS = new Set(
  [process.env['CORS_ALLOW_ORIGIN'] ?? '', 'http://localhost:3000'].filter(Boolean),
);

/**
 * Security + JSON headers attached to every response.
 * CORS uses an origin allowlist — echoes the request origin only if it's allowed.
 */
function baseHeaders(requestOrigin?: string): Record<string, string> {
  const corsOrigin =
    requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : (ALLOWED_ORIGINS.values().next().value ?? 'http://localhost:3000');

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'none'",
    'Cache-Control': 'no-store',
  };
}

export type ApiGatewayV2Response = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/** Build a 200 OK response with the given body. */
export function ok(body: unknown, requestOrigin?: string): ApiGatewayV2Response {
  return {
    statusCode: 200,
    headers: baseHeaders(requestOrigin),
    body: JSON.stringify(body),
  };
}

/** Build an error response. AppError → typed envelope; anything else → 500 INTERNAL (no details leaked). */
export function fail(err: unknown, requestOrigin?: string): ApiGatewayV2Response {
  const appErr = err instanceof AppError ? err : internalError();
  return {
    statusCode: appErr.httpStatus,
    headers: baseHeaders(requestOrigin),
    body: JSON.stringify({
      error: {
        code: appErr.code,
        message: appErr.message,
        ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      },
    }),
  };
}

export type LogFields = {
  reqId: string;
  route: string;
  from?: string;
  to?: string;
  cacheHit?: boolean;
  stale?: boolean;
  status: number;
  ms: number;
};

/**
 * Emit a structured JSON log line.
 * NEVER logs the App ID, raw provider responses, or provider headers.
 * Only the fields in LogFields are emitted.
 */
export function logEvent(fields: LogFields): void {
  process.stdout.write(JSON.stringify(fields) + '\n');
}
