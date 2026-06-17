# Implementation Audit: Currency Exchange — Full Stack

**Date**: 2026-06-17
**Status**: COMPLETE (with actionable money-correctness + IaC defects)
**Working log**: Working Logs/wlog--2026-06-17--15-24--currency-exchange-implementation.md
**Impl plan**: Implementation Plans/impl--2026-06-17--14-35--currency-exchange-implementation.md
**Spec**: specs/applied/spec--2026-06-17--14-17--currency-exchange-implementation.md

---

## Independent Evaluator Verdict

(Committed in Phase 2 — read only the spec + live code, before the working-log/impl-plan bodies.)

The implementation is substantively complete and high-quality: all three endpoints exist, money is
handled via `decimal.js` with `ROUND_HALF_EVEN` configured globally, USD triangulation and
USD-normalized stats are implemented in pure `packages/core` (zero AWS imports), the typed error
envelope never leaks stack traces, the cache fresh/expired/absent policy matches the spec, and stats
use a single atomic `UpdateItem`. `pnpm typecheck`, `pnpm lint`, `pnpm test` (95 passed), and
`pnpm audit --audit-level=high` are all green.

However, three real defects contradict the spec / its authoritative invariants:

1. **Native-float money in the stats write.** `recordConversion` does `Number(usdValueDecimalString)`
   for the DynamoDB `ADD :usd` value — converting the decimal money string through a JS native float,
   violating Constraint #1 ("No native-float money math") and spec Decision/Assumed line 62
   ("`totalSumUSD` … written via `ADD` with a **decimal string**").
2. **Validation can be pre-empted by a 503.** The convert handler loads rates _before_ validating
   input. On the (rare) cache-absent + provider-down path it throws `NO_RATES_AVAILABLE` (503) before
   ever validating, so a malformed request returns 503 instead of the Edge-Cases-mandated 400.
3. **`sst.config.ts` CORS wiring is broken**: `CORS_ALLOW_ORIGIN` is injected into the **Next.js
   site** env, not into the three **functions** that read it (`respond.ts`), and `site.url` is
   referenced inside the `site` resource's own definition (use-before-assignment / self-reference).
   The deployed site origin therefore never reaches the CORS allowlist.

---

## Goals — Static Verification

| Goal                                                                               | Status                              | Evidence                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money via decimal.js, ROUND_HALF_EVEN, round-only-at-end                           | APPEARS MET (one leak)              | `money.ts` sets `Decimal.set({ rounding: ROUND_HALF_EVEN })`; `convert.ts` rounds only at end to target dp. **Leak:** `dynamo.recordConversion` `Number(...)` on the USD sum (see Error 1).                                              |
| Round to target currency dp incl. JPY=0; never hardcode 2                          | APPEARS MET                         | `CURRENCY_DP` table has JPY/KRW/VND/IDR/ISK=0; `roundToCurrency(value, code)` uses `dpFor(code)`; tested (`money.test.ts`, `convert.test.ts` EUR→JPY 0-dp).                                                                              |
| USD triangulation `rates[to]/rates[from]`, USD=1 implicit                          | APPEARS MET                         | `rateBetween` treats USD as 1 and divides; `convert.test.ts` EUR→JPY asserts literal rounded result.                                                                                                                                     |
| USD-normalized stats sum (`amount/rate[from]`)                                     | APPEARS MET (value path leaked)     | `usdValue()` computes `amount.div(rate[from])` to 2dp; but stored via `Number()` (Error 1).                                                                                                                                              |
| Concurrency-safe atomic stats (single UpdateItem, no RMW)                          | APPEARS MET                         | `recordConversion` is one `UpdateCommand` with `ADD` + `SET if_not_exists`; matches spec expression.                                                                                                                                     |
| Cache fresh/expired/absent + 503-only-when-no-cache                                | APPEARS MET                         | `cacheState` pure + injected clock; `convert.ts`/`currencies.ts` only 503 when `state==='absent'`/`cached===null`; tested rows (a)-(e).                                                                                                  |
| Typed error envelope, no stack-trace leakage                                       | APPEARS MET                         | `respond.fail()` maps AppError→`{error:{code,message}}`, non-AppError→generic 500; `respond.test.ts` asserts no stack/no internal message.                                                                                               |
| `packages/core` imports no AWS/framework code                                      | APPEARS MET                         | core src imports only `decimal.js`, `zod`, and intra-core modules; `pnpm lint` (with the custom no-AWS rule) is green.                                                                                                                   |
| Every Edge Cases row has a matching test                                           | APPEARS MET (1 gap)                 | All rows mapped (see Edge-Case coverage below). **Gap:** "validation precedence over 503" combination is untested and currently wrong (Error 2).                                                                                         |
| Zod boundary validation                                                            | APPEARS MET                         | `validate.ts` uses `z.object(...).safeParse`; maps to `AppError`, never raw ZodError (tested).                                                                                                                                           |
| Least-privilege IAM, no wildcards, Secret, throttling, CORS allowlist (static IaC) | APPEARS UNMET (CORS) / PARTIAL      | `link[]` is per-resource (no `*`); `throttle {20,40}`; `Secret` linked. **But** CORS env mis-wired + `site.url` self-ref (Error 3); per-action read-vs-write granularity is not expressible via SST `link` (not actionable — see below). |
| Log redaction (no App ID / raw provider data)                                      | APPEARS MET                         | `provider.ts` swallows errors, never logs body; `logEvent()` emits only the fixed safe field set.                                                                                                                                        |
| `sst deploy` live URL serving 3 endpoints + site                                   | CANNOT VERIFY STATICALLY            | Step 23 deferred — no AWS creds. Requires runtime verification.                                                                                                                                                                          |
| Next.js frontend (form, result, stale badge, stats) talking only to our API        | APPEARS MET (runtime UI unverified) | `web/lib/api.ts` uses `NEXT_PUBLIC_API_URL` only, no App ID; `ResultCard`/`ConvertForm` render stale badge. Rendered layout/UX is runtime-only.                                                                                          |

## Properties Not Verifiable Without Runtime Observation

- **Live AWS deploy (Step 23):** IAM grants actually applied, API Gateway throttling enforced, CORS
  headers as served, DynamoDB TTL auto-deletion, atomic `UpdateItem` under real concurrency. Static
  inspection of `sst.config.ts` and handler code is **not** runtime confirmation.
- **DynamoDB Number serialization of `:usd`:** whether a specific decimal string survives the
  `Number()` round-trip without precision loss depends on the runtime value; the _risk_ is static and
  real (Error 1), the exact corruption is runtime-dependent.
- **Next.js rendered UI:** stale badge placement, form population from `/api/currencies`, error
  states — all runtime-rendered; only source presence is statically confirmed.
- **`pnpm --filter @currency/web build`:** working log claims OK; not re-run here (web excluded from
  `tsc -b`; root typecheck/test/lint were re-run and are green).

### Edge-Case coverage (spec table → test)

| Edge row                                                      | Test                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| from/to missing → 400 MISSING_PARAM                           | `validate.test.ts`, `convert.test.ts` (g, missing amount)         |
| from/to not [A-Z]{3} / unsupported → 400 UNSUPPORTED_CURRENCY | `validate.test.ts` (US, ZZZ, lowercase), `convert.test.ts`        |
| amount non-numeric/NaN/Inf/neg/zero → 400 INVALID_AMOUNT      | `validate.test.ts`, `convert.test.ts`                             |
| amount > 1e15 / > 20 sig digits → 400                         | `validate.test.ts`, `convert.test.ts`                             |
| from==to → 200 rate 1, counts toward stats                    | `convert.test.ts` (f) asserts rate "1" + recordConversion called  |
| provider down + fresh cache → 200 stale:false                 | `convert.test.ts` (c)                                             |
| provider down + expired cache → 200 stale:true + asOf         | `convert.test.ts` (d)                                             |
| provider down + no cache → 503                                | `convert.test.ts` (e); `currencies.test.ts`                       |
| non-2dp (JPY=0)                                               | `money.test.ts`, `convert.test.ts`                                |
| triangulation from != USD                                     | `convert.test.ts`                                                 |
| concurrent stats / single UpdateItem                          | `convert.test.ts` (h) checks one call; expression itself untested |
| stats write fails after success → still 200                   | `convert.test.ts` (i)                                             |
| currency-list provider fails (cache / no cache)               | `currencies.test.ts`                                              |
| any unexpected exception → 500 generic, no stack              | `respond.test.ts`                                                 |
| **validation must beat 503 when no cache + provider down**    | **MISSING — and currently returns 503 (Error 2)**                 |

---

## Failures & Root Causes

### Native-float conversion of the USD stats sum

**Category**: RULE_VIOLATION, SPEC_DRIFT
**What happened**: `recordConversion(toCurrency, usdValueDecimalString)` writes the DynamoDB `ADD`
value as `':usd': Number(usdValueDecimalString)` — pushing the money value through a JS native float.
**Why**: The impl plan (Step 14, lines 378/381) itself prescribes `':usd': <Number from
usdValueDecimalString>` and "stored as DynamoDB Number from the decimal string." The implementer
followed the plan faithfully, but the plan contradicts the spec's Constraint #1 ("No native-float
money math") and Assumed line 62 ("written via `ADD` with a **decimal string**"). The AWS SDK v3
DocumentClient can accept a numeric string or a `BigInt`/`Number` wrapper to preserve precision; the
chosen `Number()` defeats that. ESLint's `parseFloat` heuristic does not catch `Number()`, so the
gate stayed green.
**Evidence**: `packages/functions/src/lib/dynamo.ts:132` `':usd': Number(usdValueDecimalString)`.

### Rate-load precedes validation → 503 can pre-empt a 400

**Category**: SPEC_DRIFT, PLAN_DEVIATION (plan vs. authoritative Edge table)
**What happened**: `convert.ts` loads rates (and may throw `noRatesAvailable()` → 503) in step 1,
_before_ `parseConvertRequest` in step 2. On cache-absent + provider-down, a request with missing/bad
params returns **503** instead of the **400** the Edge Cases table mandates.
**Why**: Both the spec sketch and the impl plan (Step 14) order "load rates" before "validate"
because validation needs the supported-currency set derived from `rates`. The Edge Cases table is
authoritative and lists all malformed-input cases as 400 unconditionally; the ordering wasn't
reconciled against it. No test exercises the no-cache + bad-input combination, so it slipped through.
**Evidence**: `packages/functions/src/convert.ts:23-64` (rate load + `throw noRatesAvailable()` at
line 50, `parseConvertRequest` at line 61). Same pattern is benign for `/currencies` (no input).

### sst.config.ts: CORS allow-origin never reaches the functions + self-referential `site.url`

**Category**: SPEC_DRIFT, BUILD_FAILURE (runtime-deploy risk)
**What happened**: (a) `CORS_ALLOW_ORIGIN` is set in the **Next.js site** `environment`, but the
handlers read `process.env.CORS_ALLOW_ORIGIN` in `respond.ts` — the **functions** never receive it,
so the deployed site origin is never added to the allowlist (only `http://localhost:3000` is). (b)
`site.url` is referenced inside the `new sst.aws.Nextjs('Web', { … CORS_ALLOW_ORIGIN: site.url })`
declaration itself — `site` is not yet assigned at that point (use-before-init / self-reference).
**Why**: The env var was placed on the wrong resource and a circular dependency was introduced.
Static `pnpm typecheck` does not cover `sst.config.ts` (it's in the ESLint/tsc ignore set and needs
`sst install` to generate types), so neither gate caught it. Deploy (Step 23) was deferred, so it was
never exercised.
**Evidence**: `sst.config.ts:104-112` (`CORS_ALLOW_ORIGIN: site.url` on the site, referencing `site`
mid-definition); `packages/functions/src/lib/respond.ts:4-5` reads `CORS_ALLOW_ORIGIN` in the
functions, which receive only `RATE_CACHE_TABLE`/`STATS_TABLE`/`appIdSecret` per `sst.config.ts:55-80`.

### `topCurrency` tie-break depends on iteration order for the running leader

**Category**: (latent — not currently failing) SPEC_DRIFT risk
**What happened**: `topCurrency` updates the leader when `count === topCount && topCode !== null &&
code < topCode`. This is correct for the current tests, but the very first entry sets `topCode`
unconditionally (via `count > topCount` with `topCount = -1`); a later **equal** entry only wins if
lexicographically smaller, which is correct. The logic is actually sound; no defect confirmed. Listed
here only as a reviewed-and-cleared item, not an actionable error.
**Why**: N/A — verified correct against `{EUR:3,AUD:3}`, `{USD:10,GBP:10}`, three-way ties.
**Evidence**: `packages/core/src/stats.ts:19-26`; `stats.test.ts` tie-break cases all pass.

---

## Verification Gaps

- **Atomic `UpdateItem` expression correctness** is asserted only by "called once with `to`"
  (`convert.test.ts` h); the actual `UpdateExpression`/`ExpressionAttributeValues` (including the
  `:usd` Number issue) is **not** asserted by any test. UNCONFIRMED that the expression DynamoDB
  receives is precision-safe.
- **CORS allowlist on the deployed origin** — `respond.test.ts` only tests `localhost:3000` and a
  rejected `evil.com`; the deployed `site.url` path is UNCONFIRMED (and per Error 3 is mis-wired).
- **Live deploy (Step 23)** — IAM, throttling, TTL, real concurrency: all UNCONFIRMED, require
  runtime verification.
- **Web bundle App-ID absence** — claimed by working log via grep; not independently re-grepped at
  runtime against a built bundle (source-level absence confirmed in `web/lib/api.ts`).

---

## Actionable Errors

### Error 1: USD stats sum written through a native float

- **Category**: RULE_VIOLATION, SPEC_DRIFT
- **File(s)**: `packages/functions/src/lib/dynamo.ts` (line 132)
- **What broke**: Spec Constraint #1 / Assumed line 62 require the USD sum to be `ADD`ed as a
  precise decimal value (decimal string), never a native float. The code does
  `':usd': Number(usdValueDecimalString)`, routing money through a JS `number` and risking precision
  loss in the running `totalSumUSD` aggregate.
- **Evidence**: `dynamo.ts:132` `':usd': Number(usdValueDecimalString)`. ESLint's `parseFloat`
  heuristic does not flag `Number()`, so gates stayed green.
- **Suggested fix**: Pass the value to DynamoDB in a precision-preserving form instead of `Number()`.
  Either (a) configure the DocumentClient with `{ marshallOptions: { } }` and `ADD` a numeric value
  built from the decimal string without lossy float coercion, or (b) wrap it as a DynamoDB Number
  via the low-level attribute (`{ N: usdValueDecimalString }`) / a `BigInt`-safe path. Concretely:
  stop calling `Number(usdValueDecimalString)`; supply the decimal string as the DynamoDB Number
  payload so the `ADD` arithmetic stays arbitrary-precision. Add a test asserting the
  `ExpressionAttributeValues[':usd']` carries the exact decimal string (e.g. a 17+ significant-digit
  value that a float would corrupt).

### Error 2: Validation can be pre-empted by a 503 (wrong status for bad input when no cache)

- **Category**: SPEC_DRIFT, PLAN_DEVIATION
- **File(s)**: `packages/functions/src/convert.ts` (rate-load block lines 23-57 runs before
  `parseConvertRequest` at lines 59-64)
- **What broke**: The Edge Cases table (authoritative) requires malformed input → **400**
  unconditionally. With cache absent + provider down, the handler throws `noRatesAvailable()` (503)
  before validating, so a missing/invalid param request returns 503 instead of 400.
- **Evidence**: `convert.ts:50` `throw noRatesAvailable();` executes before line 61
  `parseConvertRequest(...)`. No test covers no-cache + bad-input; the existing 503 test (e) uses
  valid params.
- **Suggested fix**: Validate the **shape** of `from`/`to`/`amount` (presence + `[A-Z]{3}` +
  numeric/positive/cap) before loading rates, deferring only the _supported-set membership_ check
  until rates are available; or wrap rate-loading so that a `parseConvertRequest` failure on the raw
  query takes precedence over `NO_RATES_AVAILABLE`. Add a test:
  cache-absent + provider-down + `amount='abc'` (or missing `from`) → **400**, not 503.

### Error 3: CORS allow-origin mis-wired + self-referential `site.url` in sst.config.ts

- **Category**: SPEC_DRIFT
- **File(s)**: `sst.config.ts` (lines 104-112), interacting with
  `packages/functions/src/lib/respond.ts` (lines 4-5)
- **What broke**: (a) `CORS_ALLOW_ORIGIN` is injected into the Next.js site's `environment`, but it
  is read by the **Lambda functions** (`respond.ts`). The functions are configured with only
  `RATE_CACHE_TABLE`/`STATS_TABLE`/`appIdSecret`, so the deployed site origin is never added to the
  CORS allowlist — cross-origin browser calls from the deployed site would be served the fallback
  origin instead of the real one. (b) `CORS_ALLOW_ORIGIN: site.url` references `site` inside the
  `new sst.aws.Nextjs('Web', {...})` that defines `site` — a use-before-assignment / circular
  reference.
- **Evidence**: `sst.config.ts:108-110` (`NEXT_PUBLIC_API_URL: api.url`, `CORS_ALLOW_ORIGIN:
site.url` both on the site, the latter self-referencing); `sst.config.ts:48-80` (functions get no
  `CORS_ALLOW_ORIGIN`); `respond.ts:4-5` reads `process.env['CORS_ALLOW_ORIGIN']` in the functions.
- **Suggested fix**: Add `CORS_ALLOW_ORIGIN` to each function's `environment` (set it to the site
  origin), and resolve the self-reference — e.g. compute the deployed origin from `api`/a known
  domain, or pass the functions' allowed origin via the `ApiGatewayV2` `cors.allowOrigins` list
  (which already exists) and have `respond.ts` rely on API-Gateway CORS, rather than re-deriving it
  from a site-only env var. Remove `CORS_ALLOW_ORIGIN: site.url` from the site env.

**Not actionable (requires human judgment or runtime verification):**

- **Per-action IAM granularity (read-only `/stats`, write-only `Stats` for convert).** Spec line
  224-226 asks for read vs write per action, but SST `link` grants the resource's standard CRUD
  permission set and does not express action-level least privilege out of the box. Achieving strict
  action scoping requires a custom IAM policy / `permissions` override — a design decision for the
  human, not a mechanical fix. The wildcard-free, per-table scoping the spec's hard rule ("never
  wildcard `*`") **is** satisfied.
- **Live deploy verification (Step 23).** IAM as applied, API Gateway throttling enforced, DynamoDB
  TTL deletion, atomic update under real concurrency, App-ID absence in the built/served web bundle,
  CORS headers as served — all require `sst deploy` + runtime inspection (no AWS creds in this env).
- **`topCurrency` tie-break** — reviewed and found correct; no fix needed.

## Rule Violations

- **CLAUDE.md §5.1 / spec Constraint #1 (no native-float money math)** — violated by
  `dynamo.ts:132` `Number(usdValueDecimalString)`. Not intentional; inherited from the impl plan's
  own wording (Step 14). Tradeoff: convenience of a JS number for the `ADD` value vs. money
  precision; precision must win (see Error 1).
- **Spec Edge Cases authority (400 for bad input)** — violated on the no-cache + provider-down path
  by the rate-load-before-validate ordering (Error 2).
- **Spec line 220-226 / docs/security.md CORS allowlist** — the deployed-origin allowlist control is
  non-functional as wired (Error 3).
- No violation of: core-no-AWS boundary (clean), no-stack-trace leakage (clean), Secret handling
  (clean), git-direct-to-main policy (followed).

## Task Completeness

- **Unchecked items**: The working log contains no explicit "Post-Implementation Checklist" section.
  Its "Deviations from Plan" item #5 records Step 23 (live deploy) as deliberately **deferred**
  (no AWS creds / App ID) — a known, disclosed gap, not a silent omission.
- All other plan steps are reported done; `pnpm typecheck` / `lint` / `test` (95 passed) / `audit`
  re-run by the auditor and confirmed green.

---

## Proposed Skill Changes

### CLAUDE.md — extend the no-native-float rule to cover `Number()` on money headed to DynamoDB

**Insert after**: §5 invariant 1 (or §8 ESLint-invariants note)

```diff
+ - **The native-float ban includes `Number(...)`, not just `parseFloat`.** Any money value crossing
+   into a DynamoDB `ADD`/`SET` must be supplied as a precision-preserving decimal (decimal string /
+   DynamoDB `N` attribute), never `Number(decimalString)`. ESLint's heuristic only catches
+   `parseFloat`; reviewers must check `Number(...)` on money manually.
```

**Why**: Prevents Error 1 — the float leak the lint gate cannot see.
[ ] Apply?

### impl-plan.md (and this project's impl plan template) — validation must precede 503 in handler step order

**Insert after**: the handler "rate-loading policy" step

```diff
+ - **Input-shape validation runs BEFORE rate loading.** Presence + format + amount-cap checks
+   (everything not needing the supported-set) must be evaluated first so a malformed request always
+   yields 400, even when the cache is absent and the provider is down. Only the supported-currency
+   membership check may be deferred until rates are loaded. Add a test: no-cache + provider-down +
+   bad input → 400 (never 503).
```

**Why**: Prevents Error 2 — the plan's own step order produced a spec-contradicting 503.
[ ] Apply?

### impl-plan.md — IaC env vars must be attached to the resource that reads them; no self-references

**Insert after**: the infrastructure/SST step

```diff
+ - **Env vars belong on the resource that reads them.** A var consumed by a Lambda (`CORS_ALLOW_ORIGIN`)
+   must be in that function's `environment`, not the site's. **No resource may reference its own
+   output in its own definition** (e.g. `new Nextjs('Web', { env: { X: site.url } })`); compute such
+   cross-references from a separate value or after the resource is assigned.
```

**Why**: Prevents Error 3 — mis-wired CORS env + `site.url` self-reference.
[ ] Apply?

### CLAUDE.md — sst.config.ts is outside the static gates; flag it for manual review

**Insert after**: §8 "Quality-gate ladder"

```diff
+ - **`sst.config.ts` is excluded from `tsc -b` and ESLint** (triple-slash ref + generated types),
+   so neither typecheck nor lint catches its errors. Treat it as manually-reviewed code: verify env
+   wiring, link arrays, and absence of self-references by reading, and (when creds exist) `sst diff`.
```

**Why**: Explains why Errors 3-class defects pass all green gates; sets the review expectation.
[ ] Apply?

---

## Proposed learnings.md Additions

```
- 2026-06-17 currency-exchange-implementation: Money headed to a DynamoDB ADD was coerced via Number(decimalString), leaking a native float past the lint gate (which only flags parseFloat). → tighten developer-agent + CLAUDE.md no-float rule to include Number() on money.
- 2026-06-17 currency-exchange-implementation: Handler loaded rates before validating input, so no-cache+provider-down returned 503 for malformed requests instead of the Edge-Cases-mandated 400. Both spec sketch and impl plan ordered load-before-validate. → impl-plan.md: validate input shape before rate loading; reconcile handler step order against the authoritative Edge Cases table.
- 2026-06-17 currency-exchange-implementation: sst.config.ts put CORS_ALLOW_ORIGIN on the Next.js site (read by the functions) and referenced site.url inside the site's own definition; sst.config.ts is outside tsc/eslint so all gates stayed green. → impl-plan.md + CLAUDE.md: env vars on the reading resource, no self-references, treat sst.config.ts as manually-reviewed.
```

---

## Re-Audit (after fix loop 1)

**Date**: 2026-06-17

### What the fixer did

- **Error 1 (native-float in dynamo.ts):** Replaced `UpdateCommand` (DocumentClient) with the
  low-level `UpdateItemCommand` (from `@aws-sdk/client-dynamodb`) so the `:usd` value is supplied as
  a raw DynamoDB Number attribute `{ N: usdValueDecimalString }`. The `Number()` coercion path is
  gone entirely. Added `packages/functions/test/dynamo.test.ts` with two tests that spy on
  `DynamoDBClient.prototype.send` and assert the captured `ExpressionAttributeValues[':usd']` is
  `{ N: string }` (not a JS number), using 17-significant-digit values that a float would corrupt.

- **Error 2 (503-before-400 ordering in convert.ts):** Added `validateConvertShape` to
  `packages/core/src/validate.ts` — a new exported function that checks presence, well-formed
  currency format, and amount range without requiring the supported-currency set. Called it in
  `convert.ts` as step 0, before the rate-loading block. `validateConvertShape` is exported from
  `packages/core/src/index.ts`. Added four new tests in `packages/functions/test/convert.test.ts`
  under "validation precedes 503 (no cache + provider down)": missing amount → 400, bad amount → 400,
  missing from → 400, and valid params → 503 (confirming the 503 path is not broken for well-formed
  requests).

- **Error 3 (CORS mis-wiring + self-reference in sst.config.ts):** Removed
  `CORS_ALLOW_ORIGIN: site.url` from the Next.js site `environment`. Reordered resource definitions
  so `api` is created first, then `site` (with only `NEXT_PUBLIC_API_URL`), then the three Lambda
  functions — each carrying `CORS_ALLOW_ORIGIN: site.url` in their own `environment`. Because `site`
  is fully assigned before the function constructors run, `site.url` is a valid `Output<string>` with
  no self-reference.

### Updated Goals

| Goal                                                                               | Status               | Evidence                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money via decimal.js, ROUND_HALF_EVEN, round-only-at-end                           | MET                  | `dynamo.ts` now uses `UpdateItemCommand` with `{ N: usdValueDecimalString }` — no `Number()` coercion. `dynamo.test.ts` asserts the raw `{ N: string }` attribute at the call boundary. |
| USD-normalized stats sum (`amount/rate[from]`)                                     | MET                  | `usdValue()` decimal path unchanged and correct; stored path now precision-preserving (Error 1 resolved).                                                                               |
| Every Edge Cases row has a matching test                                           | MET                  | The previously missing "validation must beat 503" row is now covered by four tests in `convert.test.ts` (no-cache + provider-down + bad input → 400).                                   |
| Least-privilege IAM, no wildcards, Secret, throttling, CORS allowlist (static IaC) | APPEARS MET (static) | `CORS_ALLOW_ORIGIN: site.url` is now on each function's `environment`; self-reference resolved by ordering. Runtime CORS behavior still requires live deploy to confirm.                |

### Test suite

10 test files, 101 tests passed (up from 95). `pnpm typecheck` clean. `pnpm lint` clean. `pnpm audit --audit-level=high` reports no known vulnerabilities.

### Remaining Actionable Errors

None.
