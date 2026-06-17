# Fixer Log

**Date**: 2026-06-17
**Audit**: Working Logs/audit-impl--2026-06-17--15-33--currency-exchange-implementation.md
**Impl plan**: Implementation Plans/impl--2026-06-17--14-35--currency-exchange-implementation.md

## Fixes Applied

- `packages/functions/src/lib/dynamo.ts`: Replaced `Number(usdValueDecimalString)` with a low-level `UpdateItemCommand` (from `@aws-sdk/client-dynamodb`, not the DocumentClient) using `{ N: usdValueDecimalString }` as the raw DynamoDB Number attribute for `:usd`. This removes the native-float coercion path entirely — the decimal string is passed directly to DynamoDB without any JS `Number()` round-trip. Removed `UpdateCommand` from `@aws-sdk/lib-dynamodb` imports (no longer needed for stats); added `UpdateItemCommand` from `@aws-sdk/client-dynamodb`.
- `packages/functions/test/dynamo.test.ts` (new): Added two tests asserting that `recordConversion` passes a `{ N: string }` attribute (not a JS number) for `:usd`, using a `vi.spyOn` on `DynamoDBClient.prototype.send`. Test values have 17 significant digits to verify precision is preserved across values a float would corrupt.
- `packages/core/src/validate.ts`: Added `validateConvertShape` — a new exported function that validates presence, well-formed currency format, and amount range, but does NOT check currency membership against the supported set (that check still requires rates). This function is called by the handler before rate loading.
- `packages/core/src/index.ts`: Exported `validateConvertShape` alongside `parseConvertRequest`.
- `packages/functions/src/convert.ts`: Added a call to `validateConvertShape({ from, to, amount })` as step 0, before the rate-loading block. A malformed request (missing param, bad amount, malformed currency code) now throws an `AppError` (400) before any DynamoDB or provider call — ensuring 400 is returned even when there is no cache and the provider is down.
- `packages/functions/test/convert.test.ts`: Added four new tests under "validation precedes 503 (no cache + provider down)": missing amount → 400 MISSING_PARAM, bad amount → 400 INVALID_AMOUNT, missing from → 400 MISSING_PARAM, valid params → 503 NO_RATES_AVAILABLE (confirming the 503 path is unchanged for well-formed requests).
- `sst.config.ts`: Removed `CORS_ALLOW_ORIGIN: site.url` from the Next.js site's `environment` (it was a self-reference — `site` was not yet assigned at that point — and was on the wrong resource since `respond.ts` reads this in Lambda). Reordered resource definitions: `api` is now created before `site` (api.url is an Output resolved at deploy time, so routes can be wired after), then `site` (with only `NEXT_PUBLIC_API_URL`), then the three Lambda functions — each now carrying `CORS_ALLOW_ORIGIN: site.url` in their `environment`. Because `site` is fully assigned before the function constructors run, `site.url` is a valid `Output<string>` with no self-reference. The `api.route(...)` calls remain after all function definitions.

## Skipped (Not Actionable)

- Per-action IAM granularity (read-only `/stats`, write-only stats for convert): SST `link` does not express action-level least privilege; requires custom IAM policy. Design decision for the human.
- Live deploy verification: No AWS creds available; IAM, throttling, TTL, concurrency require runtime inspection.
- `topCurrency` tie-break: Reviewed and confirmed correct by auditor; no fix needed.

## Skipped (Fix Failed)

(none)

## Skipped (Product Decision)

(none)

## Deferred to User

(none)
