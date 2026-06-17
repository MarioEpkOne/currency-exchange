# ADR-0006: Typed JSON error envelope {error:{code,message,details?}}

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The API must return consistent, machine-readable errors. Two concerns drive the design:

1. **Frontend + clients need stable error codes** to render localized/friendly messages.
2. **Security** — error responses must never leak stack traces, internal paths, or raw Zod errors.

## Decision

All errors are wrapped in a typed JSON envelope:

```json
{ "error": { "code": "INVALID_AMOUNT", "message": "human-readable", "details": "optional" } }
```

Success responses return the resource directly (no wrapper):

```json
{
  "from": "USD",
  "to": "EUR",
  "amount": "100",
  "result": "92.00",
  "rate": "0.92",
  "asOf": "...",
  "stale": false
}
```

`ErrorCode` is a discriminated union: `INVALID_AMOUNT | UNSUPPORTED_CURRENCY | MISSING_PARAM |
NO_RATES_AVAILABLE | PROVIDER_ERROR | INTERNAL`. Any unexpected exception maps to `500 INTERNAL`
with a generic message — the raw error is never serialized.

Numeric fields (`amount`, `result`, `rate`, `totalSumUSD`) are **strings** on the wire to preserve
precision and avoid float drift in JSON parsers.

## Consequences

- Clients can `switch(error.code)` for robust error handling.
- No stack traces, no raw ZodErrors, no AWS error shapes ever reach the client.
- `packages/core/src/errors.ts` defines the `AppError` class and factory helpers.
- `packages/functions/src/lib/respond.ts::fail()` handles the mapping; non-AppError → 500.

## Alternatives considered

- **HTTP status only** — insufficient; 400 covers many distinct error types. Ruled out.
- **RFC 7807 Problem Details** — more verbose and not meaningfully better for this surface area.
