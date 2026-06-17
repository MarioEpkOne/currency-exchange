# ADR-0008: Production hardening — structured logging, throttling, CORS, security headers, least-priv IAM

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The system is public, unauthenticated, and handles money. Four hardening controls were explicitly
required by the spec (Decision #9) and `docs/security.md`:

1. **Structured + redacted logging** — per-invocation `reqId` + structured fields; never log the
   App ID or raw provider responses.
2. **API Gateway throttling** — rate and burst limits to limit abuse/cost.
3. **CORS allowlist** — never `Access-Control-Allow-Origin: *`; echo only allowed origins.
4. **Security headers + input caps** — standard HTTP security headers + amount/sig-digit caps.
5. **Least-privilege IAM** — each Lambda has only the DynamoDB actions it needs, never `*`.

## Decision

All four controls are implemented:

- `packages/functions/src/lib/respond.ts`: `logEvent()` emits structured JSON with only safe
  fields; `baseHeaders()` sets `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`, `CSP`,
  `Cache-Control: no-store`, and an allowlisted `Access-Control-Allow-Origin`.
- `packages/core/src/validate.ts`: `amount` capped at `1e15` and 20 significant digits.
- `sst.config.ts`: `throttle: { rate: 20, burst: 40 }` on `ApiGatewayV2`; each function's
  `link: []` list uses SST's least-privilege grants (specific table + action, no wildcards).
- `packages/functions/src/lib/provider.ts`: App ID never logged; errors caught and translated.

## Consequences

- The deployed API is hardened against common abuse vectors (DoS via large amounts, CORS attacks,
  information disclosure via error bodies or logs).
- `CORS_ALLOW_ORIGIN` env var is set by `sst.config.ts` at deploy time to the site URL.
- CloudWatch logs contain only `reqId, route, from, to, cacheHit, stale, status, ms`.

## Alternatives considered

- **CORS: allow-all** — rejected; the spec and `docs/security.md` explicitly require an allowlist.
- **Wildcard IAM** — rejected; violates `docs/security.md` least-privilege control.
