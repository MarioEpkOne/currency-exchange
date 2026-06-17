# packages/functions — Agent Notes

**Thin Lambda adapters only. Business logic lives in `@currency/core` — do not duplicate it here.**

This package contains the three Lambda handlers (`convert`, `currencies`, `stats`) and their infrastructure support libs (`dynamo.ts`, `provider.ts`, `respond.ts`). Handlers orchestrate: load cache → call provider → validate → convert → record stats → respond.

## Key invariants

- **No business logic here** — all conversion math, validation, cache policy, and stats domain go through `@currency/core`.
- **App ID never logged** — `provider.ts` reads `OPENEXCHANGERATES_APP_ID` from env; it is never included in logs, errors, or response bodies.
- **Stats write is best-effort** — a failed `recordConversion` must not fail the `/convert` 200 response. Wrap it in try/catch and log.
- **Structured logs only** — use `logEvent()` from `respond.ts`. Fields: `reqId`, `route`, `from`, `to`, `cacheHit`, `stale`, `status`, `ms`. No raw provider data.

## Handler entry points

- `src/convert.ts` → `GET /api/convert`
- `src/currencies.ts` → `GET /api/currencies`
- `src/stats.ts` → `GET /api/stats`

## Tests

Integration tests in `test/` mock `dynamo` and `provider` — never call live AWS or the provider.

```bash
pnpm test          # all tests (from repo root)
pnpm typecheck     # tsc -b
pnpm lint          # ESLint
```
