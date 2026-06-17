# Implementation Plan: Currency Exchange — Full Stack (core + functions + DynamoDB + web + SST)

## Header

- **Spec**: specs/applied/spec--2026-06-17--14-17--currency-exchange-implementation.md
- **Worktree**: /mnt/c/Users/Epkone/CurrencyExchange
- **Git policy**: This project commits **directly to `main`** — no branches/worktrees/PRs (`CLAUDE.md` "Repository workflow", spec Current State). The "Worktree" path above IS the main working tree. Each numbered step (or small group of related steps) ends with a Conventional-Commits commit on `main`; let the Husky quality gate run (never `--no-verify` — a `PreToolUse` hook blocks it).

### Environment assumptions verified (Phase 2, read from /mnt/c/Users/Epkone/CurrencyExchange)

- `node -v` = **v22.22.2**; `pnpm -v` = **10.33.0** (matches `packageManager` pin). Confirmed.
- **Vitest is installed** (`node_modules/.bin/vitest` present; `vitest@^4.1.9` in root `package.json` devDeps). Test runner ready.
- **`zod`, `decimal.js`, and `@aws-sdk/*` are NOT yet in `pnpm-lock.yaml`** (grep returned 0). They must be **added** as workspace deps in the steps below; do not assume they exist.
- `pnpm-workspace.yaml` already globs `packages/*` and `web` — new packages are auto-discovered; **no edit to that file needed**.
- `tsconfig.json` (root) currently has `"files": []` and `"references": []` — every new package's tsconfig must be **added to `references`** for `tsc -b` to see it.
- **ESLint already enforces** both invariants: `packages/core/**` may not import `@aws-sdk/*`/`sst`/`next`; `packages/**` bans `parseFloat`/`Number.parseFloat` (verified in `eslint.config.js`). New code must satisfy these; no eslint config change required for the core boundary.
- **CI already runs `pnpm audit --audit-level=high`** (verified in `.github/workflows/ci.yml`); the spec's "add pnpm audit to CI" is therefore mostly satisfied — Step 22 only _verifies_ it and enables the commented `pnpm build` line.
- ADR numbering continues from **0001** (`docs/adr/0001-record-architecture-decisions.md` exists; template is Nygard format). New ADRs are **0002–0009**.
- `docs/adr/README.md` has an "Open decisions awaiting an ADR" list of **5 items** that must be checked off / replaced.
- `CLAUDE.md` §9 lists the same 5 deferred decisions to replace.

### Context7 — pull current docs BEFORE writing infra/SDK/framework code (CLAUDE.md §8)

Training data lags these libraries. Before writing the named files, the implementing agent MUST pull current docs via the **Context7 MCP**:

- **Before `sst.config.ts` (Step 18):** SST **v3 (Ion)** — the infra API differs substantially from v2 (`new sst.aws.Dynamo`, `new sst.aws.Function`/`Router`/`ApiGatewayV2`, `sst.aws.Nextjs`, `new sst.Secret`, `link`, transforms for throttling/CORS/IAM). Do not assume v2 syntax.
- **Before `packages/functions/src/lib/dynamo.ts` (Step 12):** **AWS SDK for JS v3** — `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient`, `GetCommand`/`PutCommand`/`UpdateCommand`.
- **Before `packages/functions/src/lib/provider.ts` (Step 13):** confirm the openexchangerates `latest.json` / `currencies.json` response shapes (native `fetch` on Node 22 — no extra dep).
- **Before `packages/core/src/validate.ts` (Step 6):** **Zod** current API (`z.object`, `safeParse`, issue shape) — map issues to `AppError`, never surface raw Zod errors.
- **Before `packages/core/src/money.ts` (Step 4):** **decimal.js** — `Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })`, `.mul/.div/.toDecimalPlaces`, `.isFinite`, `.precision()`.
- **Before `web/` (Steps 15–17):** **Next.js App Router** (current `app/` conventions, server vs client components).

---

## Scope — files in play (agent must not touch files not listed here)

**New — packages/core**

- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/types.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/money.ts`
- `packages/core/src/currencies.ts`
- `packages/core/src/validate.ts`
- `packages/core/src/convert.ts`
- `packages/core/src/rates.ts`
- `packages/core/src/stats.ts`
- `packages/core/src/index.ts`
- `packages/core/test/money.test.ts`
- `packages/core/test/convert.test.ts`
- `packages/core/test/validate.test.ts`
- `packages/core/test/rates.test.ts`
- `packages/core/test/stats.test.ts`
- `packages/core/CLAUDE.md`

**New — packages/functions**

- `packages/functions/package.json`
- `packages/functions/tsconfig.json`
- `packages/functions/src/lib/dynamo.ts`
- `packages/functions/src/lib/provider.ts`
- `packages/functions/src/lib/respond.ts`
- `packages/functions/src/convert.ts`
- `packages/functions/src/currencies.ts`
- `packages/functions/src/stats.ts`
- `packages/functions/test/convert.test.ts`
- `packages/functions/test/currencies.test.ts`
- `packages/functions/test/stats.test.ts`
- `packages/functions/test/respond.test.ts`
- `packages/functions/CLAUDE.md`

**New — web**

- `web/package.json`
- `web/tsconfig.json`
- `web/next.config.mjs`
- `web/next-env.d.ts` (generated; do not hand-edit)
- `web/app/layout.tsx`
- `web/app/page.tsx`
- `web/app/globals.css`
- `web/lib/api.ts`
- `web/components/ConvertForm.tsx`
- `web/components/ResultCard.tsx`
- `web/components/StatsPanel.tsx`
- `web/CLAUDE.md`

**New — infra & test config**

- `sst.config.ts`
- `vitest.config.ts` (root, optional — see Step 2)

**Modified — root config**

- `tsconfig.json` (add `references` for the new packages)
- `package.json` (root — add `vitest` project glob only if needed; otherwise unchanged)
- `.github/workflows/ci.yml` (enable the commented `pnpm build` line — Step 22)

**Modified — docs (docs-travel-with-code, CLAUDE.md §8)**

- `CLAUDE.md` (replace §9 deferred list with resolved outcomes; update §2/§8 status notes)
- `README.md` (setup, SST Secret, sst dev/deploy, testing)
- `docs/security.md` (tick/verify the pre-submission checklist against shipped code)
- `docs/adr/README.md` (check off the 5 open decisions; add index entries 0002–0009)
- `docs/adr/0002-...` … `docs/adr/0009-...` (one ADR per resolved decision)

**Read-only context (do not modify):** `GOAL.md`, `eslint.config.js`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `.env.example`, `.husky/*`, `.github/workflows/secret-scan.yml`, `docs/adr/template.md`, `docs/adr/0001-record-architecture-decisions.md`.

## Reading list (read these in order before starting, nothing else)

1. `specs/applied/spec--2026-06-17--14-17--currency-exchange-implementation.md` (authoritative mechanism; **Edge Cases table wins** on any conflict)
2. `CLAUDE.md` (§4 boundary, §5 invariants, §6 edge cases, §8 commands + Context7, §9 deferred list to replace)
3. `docs/security.md` (authoritative threat→control table + pre-submission checklist — binding)
4. `GOAL.md` (north-star; §6 behavior, §7 stats)
5. `tsconfig.base.json`, `tsconfig.json` (project-reference wiring; strict + `noUncheckedIndexedAccess`)
6. `eslint.config.js` (the two enforced invariants new code must satisfy)
7. `package.json` (root scripts + the lint-staged + the existing devDeps)
8. `.github/workflows/ci.yml` (already runs audit; build line commented)
9. `docs/adr/template.md`, `docs/adr/README.md`, `docs/adr/0001-record-architecture-decisions.md` (ADR format + open list)
10. `README.md` (the sections marked _TODO_ that this work fills in)
11. `.env.example` (the App ID env var name: `OPENEXCHANGERATES_APP_ID`)

---

## Build order rationale

Bottom-up so each layer is independently verifiable: **(A)** workspace scaffolding → **(B)** `packages/core` pure logic + its unit tests (no AWS, fully testable) → **(C)** `packages/functions` adapters + integration tests (provider + dynamo mocked) → **(D)** `web/` → **(E)** `sst.config.ts` infra → **(F)** docs sync (CLAUDE.md §9, ADRs, README, security checklist) → **(G)** CI + final verification + deploy. Each step lists file scope, verification command(s), and a draft commit. **Run from the repo root with absolute-cwd-safe commands.**

---

## Steps

### Step 1: Scaffold `packages/core` workspace package

**Files**: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts` (placeholder)

**Action**: Create the package.

- `package.json`: `name: "@currency/core"`, `"private": true`, `"type": "module"`, `"main"`/`"types"` pointing at built `dist/`, `"exports"` for `.` → `./dist/index.js`. Scripts: `"build": "tsc -b"`, `"test": "vitest run"`. Add runtime deps **`decimal.js`** and **`zod`** (latest — confirm versions via Context7/registry at install time). No AWS deps (ESLint will fail the build otherwise).
- `tsconfig.json`: `extends ../../tsconfig.base.json`, `compilerOptions: { outDir: "dist", rootDir: "src" }`, `include: ["src"]`. (Do NOT include `test/` in the emitted build's `rootDir`; either a separate `tsconfig` for tests or `include: ["src","test"]` with `noEmit` for the test project — keep `composite` build emitting only `src`.)
- `src/index.ts`: temporary `export {};` placeholder (replaced in Step 9).

**Then**: add `{ "path": "packages/core" }` to root `tsconfig.json` `references` (currently `"references": []`, verified from `/mnt/c/Users/Epkone/CurrencyExchange/tsconfig.json`).

**Install**: `pnpm install` from repo root (adds decimal.js + zod to the lockfile).

**Verification**: `pnpm typecheck` clean; `pnpm lint` clean; `decimal.js` + `zod` now appear in `pnpm-lock.yaml`.

**Commit**: `chore(core): scaffold @currency/core workspace package`

---

### Step 2: Wire Vitest to discover package tests

**Files**: `vitest.config.ts` (root) — or per-package `vitest.config.ts`; choose the root projects form.

**Action**: Add a root `vitest.config.ts` using the Vitest "projects" feature so `pnpm test` (already `vitest run --passWithNoTests` at root) discovers `packages/core/test` and `packages/functions/test`. Pull current Vitest config API via Context7 if unsure (v4). Keep `--passWithNoTests` behavior until tests land.

**Verification**: `pnpm test` runs and reports 0 tests passing (no error). `pnpm typecheck` clean.

**Commit**: `test: configure vitest projects for package test discovery`

---

### Step 3: Core — shared types (`types.ts`)

**File**: `packages/core/src/types.ts`

**Action**: Define the shared request/response + record types (re-exported to functions/web per spec layout):

- `Currency = string` (ISO-4217 3-letter; brand optional).
- `RatesMap = Record<string, number>` (provider rates, USD-base; `USD` implicitly 1).
- `RateSnapshot = { rates: RatesMap; fetchedAt: string /* ISO */ }`.
- `CurrencyList = Record<string, string>` (code → display name).
- `ConvertResult = { from: string; to: string; amount: string; result: string; rate: string; asOf: string; stale: boolean }` (numeric fields **strings**, spec wire format).
- `CurrenciesResponse = { currencies: CurrencyList; asOf: string; stale: boolean }`.
- `StatsResponse = { totalCount: number; totalSumUSD: string; topCurrency: string | null }`.
- `ParsedConvertRequest = { from: string; to: string; amount: import('decimal.js').Decimal }` (internal).

**What it does**: Single source of truth for the API contract shape; imported by handlers and the web client.

**Verification**: `pnpm typecheck` clean.

**Commit**: (bundled into Step 9's commit; or commit now) `feat(core): add shared API + record types`

---

### Step 4: Core — money helpers (`money.ts`) — Decision #2, #5; Edge: JPY 0-dp, small/large amounts

**File**: `packages/core/src/money.ts`

**Action** (pull decimal.js docs via Context7 first):

- Configure global rounding once: `Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })` (banker's rounding, Decision #5). Do NOT rely on the default.
- `CURRENCY_DP: Record<string, number>` — minimal ISO-4217 dp table: `USD:2, EUR:2, GBP:2, JPY:0, …` (include at least USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, plus the common 0-dp ones KRW, VND). **Never hardcode 2 globally.**
- `dpFor(code: string): number` — returns the table value; **unknown-but-provider-supported** code → default **2** **with a logged warning** (use a passed-in/imported logger or `console.warn` flagged for redaction-safety — no secrets).
- `roundToCurrency(value: Decimal, code: string): Decimal` — `value.toDecimalPlaces(dpFor(code), Decimal.ROUND_HALF_EVEN)`.
- `formatMoney(value: Decimal, code: string): string` — rounded `.toFixed(dpFor(code))` returned as **string**.

**Constraint**: only `number`s allowed in this module are rates/dp table values and array indices; all arithmetic via `Decimal`. No `parseFloat`/`Number(...)` on money (ESLint-enforced).

**Verification**: `pnpm typecheck` + `pnpm lint` clean (covered by tests in Step 8).

**Commit**: (bundle with Step 9)

---

### Step 5: Core — currency-set helpers (`currencies.ts`)

**File**: `packages/core/src/currencies.ts`

**Action**:

- `isWellFormedCode(code: string): boolean` → `/^[A-Z]{3}$/.test(code)`.
- `isSupported(code: string, supported: ReadonlySet<string>): boolean` — well-formed AND in the supported set (the set is derived at the handler from the cached currency list / rates map keys + `USD`).
- `supportedFromRates(rates: RatesMap): Set<string>` — `new Set([...Object.keys(rates), 'USD'])`.

**What it does**: Pure predicates the validator and handlers use to decide `UNSUPPORTED_CURRENCY`.

**Verification**: covered by validate tests (Step 8 / Step 6 tests).

**Commit**: (bundle with Step 9)

---

### Step 6: Core — error model + Zod validation (`errors.ts`, `validate.ts`) — Decision #7; Edge: all 400 rows; security.md (Zod boundary, no raw errors)

**Files**: `packages/core/src/errors.ts`, `packages/core/src/validate.ts`

**Action — `errors.ts`** (matches spec sketch):

```ts
export type ErrorCode =
  | 'INVALID_AMOUNT'
  | 'UNSUPPORTED_CURRENCY'
  | 'MISSING_PARAM'
  | 'NO_RATES_AVAILABLE'
  | 'PROVIDER_ERROR'
  | 'INTERNAL';
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, httpStatus: number, message: string, details?: unknown);
}
```

Provide named constructors/helpers: `missingParam(name)`→400 `MISSING_PARAM`; `unsupportedCurrency(code)`→400 `UNSUPPORTED_CURRENCY`; `invalidAmount(reason)`→400 `INVALID_AMOUNT`; `noRatesAvailable()`→503 `NO_RATES_AVAILABLE`; `providerError()`→`PROVIDER_ERROR` (internal/treated-as-down, not surfaced as 5xx unless no cache); `internal()`→500 `INTERNAL` (generic message, no detail leak).

**Action — `validate.ts`** (pull Zod docs via Context7 first):

- Zod schema for raw query params. **Validation order matters and must match the Edge Cases table precedence**:
  1. **Missing** `from`/`to`/`amount` (param absent/empty) → **`MISSING_PARAM`** (400). This MUST be checked **before** format/range so a missing param never reports `INVALID_AMOUNT`/`UNSUPPORTED_CURRENCY`.
  2. `from`/`to` not `[A-Z]{3}` **or** not in supported set → **`UNSUPPORTED_CURRENCY`** (400).
  3. `amount`: parse with **`new Decimal(raw)`** wrapped in try/catch (NOT `parseFloat`/`Number`); reject if not finite (`NaN`/`Infinity`), `<= 0` (negative/zero), `> 1e15`, or `> 20` significant digits (`.precision(true)`/`.sd()`) → **`INVALID_AMOUNT`** (400).
- `parseConvertRequest(raw: { from?; to?; amount? }, supported: ReadonlySet<string>): ParsedConvertRequest` — returns the typed parsed request or **throws `AppError`** (handler catches). **Map any raw Zod issue to `AppError`** — never return/throw a raw `ZodError` or stack trace (security.md).
- Note: the supported-set check needs the rates loaded; so `parseConvertRequest` takes the `supported` set. Missing-param and amount-shape checks that don't need rates may run first (handler may call a `parseShape` then `checkSupported` — keep both code paths but the public function is `parseConvertRequest`).

> **Edge-case guard cross-check (Phase 3.5)**: the missing-param check (1) preempts amount-shape (3) and currency-format (2). Test inputs for `UNSUPPORTED_CURRENCY` and `INVALID_AMOUNT` MUST supply the _other_ params as valid, so the missing-param guard does not fire first and mask the intended code. Tests in Step 8 are written accordingly.

**Verification**: `pnpm typecheck` + `pnpm lint` clean; behavior covered by Step 8 validate tests.

**Commit**: (bundle with Step 9)

---

### Step 7: Core — conversion, cache-policy, stats domain (`convert.ts`, `rates.ts`, `stats.ts`)

**Files**: `packages/core/src/convert.ts`, `packages/core/src/rates.ts`, `packages/core/src/stats.ts`

**Action — `convert.ts`** (Edge: from==to, JPY, cross-rate, small/large):

- `rateBetween(rates: RatesMap, from: string, to: string): Decimal` — `rate(USD)=1`; returns `new Decimal(rates[to] ?? throw).div(new Decimal(rates[from] ?? throw))`. (Guard missing keys → caller already validated support, but defend.)
- `convert(amount: Decimal, from: string, to: string, rates: RatesMap): { result: Decimal; rate: Decimal }`:
  - **`from === to`** → short-circuit `{ result: roundToCurrency(amount, from), rate: new Decimal(1) }` (Edge: 200, rate 1, counts in stats).
  - else `rate = rateBetween(rates, from, to)`; `result = roundToCurrency(amount.mul(rate), to)` — **round only at the end, to the TARGET dp**, `ROUND_HALF_EVEN`.
- `usdValue(amount: Decimal, from: string, rates: RatesMap): Decimal` — `amount.div(rate(from))` rounded to **2 dp** (USD-normalized stats sum, Edge: mixed-currency sum).

**Action — `rates.ts`** (pure cache policy; takes injected `now: Date`/epoch — Edge: fresh/expired/absent):

- `RATE_TTL_SECONDS = 3600`, `CURRENCY_TTL_SECONDS = 86400`.
- `cacheState(fetchedAt: string | null, ttlSeconds: number, now: number): 'fresh' | 'expired' | 'absent'` — `absent` if `fetchedAt == null`; else `fresh` if `now < epoch(fetchedAt)+ttl`, else `expired`.
- Document the consumption rule (implemented in the handler, Step 11): **fresh** → use, `stale:false`; **expired** → only used as fallback when provider fetch fails → `stale:true`, `asOf=fetchedAt`; **absent** + fetch fails → `NO_RATES_AVAILABLE` (503).

**Action — `stats.ts`** (Decision #4; Edge: argmax tie-break, empty state, USD normalize):

- `topCurrency(targetCounts: Record<string, number>): string | null` — `argmax`; **tie → lexicographically smallest code** (deterministic); empty map → `null`.
- `buildStatsResponse(item: { totalCount?: number; totalSumUSD?: string | number; targetCounts?: Record<string, number> } | null): StatsResponse` — empty/null → `{ totalCount: 0, totalSumUSD: '0', topCurrency: null }`; else map through, `totalSumUSD` via `new Decimal(...).toFixed(2)`.

**Verification**: `pnpm typecheck` + `pnpm lint` clean; behavior covered by Step 8 tests.

**Commit**: (bundle with Step 9)

---

### Step 8: Core — unit tests (Vitest) — Testing Strategy "Unit" + every Edge 400/conversion row

**Files**: `packages/core/test/money.test.ts`, `convert.test.ts`, `validate.test.ts`, `rates.test.ts`, `stats.test.ts`

**Action**: write Vitest unit tests. Each assertion uses the spec's **literal expected value** (Phase 3.5 assertion-quality rule), not a re-derived formula.

- **`money.test.ts`**: `dpFor('USD')===2`, `dpFor('JPY')===0`; `roundToCurrency` banker's-rounding boundaries — `2.345 → "2.34"` and `2.355 → "2.36"` (ROUND_HALF_EVEN); unknown code → defaults to 2 dp; `formatMoney` returns string with correct dp (JPY no decimals).
- **`convert.test.ts`**: USD→USD rate-1 short-circuit (`from==to`); USD→EUR (single ratio); **EUR→JPY triangulation** with a fixed rates map, asserting the literal rounded 0-dp result; large amount (e.g. `1e14`) and small amount (e.g. `0.000001`) stay exact through `Decimal`; `usdValue` normalization for a non-USD `from`.
- **`validate.test.ts`** (cross-checked against the missing-param guard precedence): missing `from` → `MISSING_PARAM`; missing `amount` → `MISSING_PARAM`; `from='US'` (others valid) → `UNSUPPORTED_CURRENCY`; `from='ZZZ'` not in set (others valid) → `UNSUPPORTED_CURRENCY`; `amount='abc'`/`'NaN'`/`'Infinity'`/`'1e2x'`(leading-junk) (others valid) → `INVALID_AMOUNT`; `amount='-5'` → `INVALID_AMOUNT`; `amount='0'` → `INVALID_AMOUNT`; `amount='1e16'` (> 1e15) → `INVALID_AMOUNT`; amount with > 20 sig digits → `INVALID_AMOUNT`. Assert the **thrown `AppError.code` and `httpStatus`**, and assert it is an `AppError` (not a raw `ZodError`).
- **`rates.test.ts`**: with injected `now` — `cacheState` returns `fresh` just under TTL, `expired` just over, `absent` for `null`; do the same for the 24h currency TTL.
- **`stats.test.ts`**: `topCurrency` picks max; **tie → lexicographically smallest** (e.g. `{EUR:3, AUD:3} → 'AUD'`); empty map → `null`; `buildStatsResponse(null)` → `{ totalCount:0, totalSumUSD:'0', topCurrency:null }`; populated item maps through with `totalSumUSD` 2-dp string.

**Verification**: `pnpm test` — all core tests green; `pnpm typecheck` + `pnpm lint` clean.

**Commit**: (bundle with Step 9)

---

### Step 9: Core — barrel export + commit the whole core package

**File**: `packages/core/src/index.ts`

**Action**: replace the Step-1 placeholder with re-exports of the public surface: types, `AppError` + helpers, money helpers, currency helpers, `parseConvertRequest`, `convert`/`usdValue`/`rateBetween`, `cacheState` + TTL constants, `topCurrency`/`buildStatsResponse`.

Also add `packages/core/CLAUDE.md` (nested per-package agent doc, CLAUDE.md §8): one-paragraph "pure logic, NO aws/next/sst imports, all money via Decimal+ROUND_HALF_EVEN, exhaustively unit-tested" + the public exports list.

**Verification**: `pnpm typecheck` + `pnpm lint` + `pnpm test` all clean.

**Commit**: `feat(core): conversion, validation, cache-policy & stats domain with unit tests`

---

### Step 10: Scaffold `packages/functions` workspace package

**Files**: `packages/functions/package.json`, `packages/functions/tsconfig.json`

**Action**:

- `package.json`: `name: "@currency/functions"`, `"type": "module"`, deps: `@currency/core` (workspace:\*), `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `zod` (peer/direct). devDeps: `aws-lambda` types (`@types/aws-lambda`). Scripts `"build": "tsc -b"`, `"test": "vitest run"`. **No `decimal.js` math in handlers beyond passing strings to/from core** — keep business logic in core.
- `tsconfig.json`: `extends ../../tsconfig.base.json`, `outDir: dist`, `references: [{ "path": "../core" }]`.
- Add `{ "path": "packages/functions" }` to root `tsconfig.json` `references`.
- `pnpm install` (adds AWS SDK v3 + types to lockfile).

**Verification**: `pnpm typecheck` clean; AWS SDK packages appear in `pnpm-lock.yaml`.

**Commit**: `chore(functions): scaffold @currency/functions workspace package`

---

### Step 11: Functions — `respond.ts` (envelope, headers, structured redacted logging) — Decision #7, #9; security.md (log redaction, security headers, CORS)

**File**: `packages/functions/src/lib/respond.ts`

**Action** (Context7 for the API Gateway v2 / Lambda proxy response shape):

- `ok(body, extraHeaders?)` → `{ statusCode: 200, headers, body: JSON.stringify(body) }`.
- `fail(err: unknown)` → if `AppError`: `{ statusCode: err.httpStatus, body: { error: { code: err.code, message: err.message, details?: err.details } } }`; else map to **`500 INTERNAL`** with a **generic message** — **never** serialize the raw error / stack (Edge: any unexpected exception; security.md error-disclosure control).
- `baseHeaders()` — **security headers** (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`, a conservative `Content-Security-Policy` for the JSON API, `Cache-Control: no-store`) + `Content-Type: application/json`. **CORS** headers (`Access-Control-Allow-Origin` from an **allowlist** env var — deployed site origin + `http://localhost:3000`, never `*` for credentialed responses; here unauthenticated so allowlist echo of permitted origins).
- `logEvent(fields)` — structured JSON log `{ reqId, route, from, to, cacheHit, stale, status, ms }`. **Redaction is mandatory**: never log the App ID, raw provider responses, or provider headers (security.md). `reqId` generated per invocation (`crypto.randomUUID()`).

**Verification**: `pnpm typecheck` + `pnpm lint` clean; behavior tested in Step 14 (`respond.test.ts`).

**Commit**: (bundle with Step 14)

---

### Step 12: Functions — `dynamo.ts` (cache + stats DynamoDB adapters) — Decision #4, #6; Edge: atomic stats, cache items

**File**: `packages/functions/src/lib/dynamo.ts`

**Action** (pull AWS SDK v3 docs via Context7 first — `DynamoDBDocumentClient`, `GetCommand`/`PutCommand`/`UpdateCommand`):

- Construct a module-level `DynamoDBDocumentClient`. Table names come from **env vars injected by SST `link`** (e.g. `process.env.RATE_CACHE_TABLE`, `process.env.STATS_TABLE`) — do not hardcode.
- **Rate cache**:
  - `getRateSnapshot()` → `GetCommand` `PK='RATES#USD'` → `{ rates, fetchedAt } | null`.
  - `putRateSnapshot(rates, fetchedAt)` → `PutCommand` with `ttl = epoch(fetchedAt)+3600`.
  - `getCurrencyList()` / `putCurrencyList(currencies, fetchedAt)` → `PK='CURRENCIES'`, `ttl = epoch+86400`.
- **Stats — single atomic `UpdateItem`** (Decision #4, spec expression verbatim):
  - `recordConversion(toCurrency: string, usdValueDecimalString: string)` →
    ```
    UpdateExpression: 'ADD totalCount :one, totalSumUSD :usd SET targetCounts.#cur = if_not_exists(targetCounts.#cur, :zero) + :one'
    ExpressionAttributeNames:  { '#cur': toCurrency }
    ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':usd': <Number from usdValueDecimalString> }
    Key: { PK: 'STATS#GLOBAL' }
    ```
    **No read-modify-write.** `totalSumUSD` stored as DynamoDB Number from the decimal string.
  - `getStats()` → `GetCommand` `PK='STATS#GLOBAL'` → raw item | null.

**Verification**: `pnpm typecheck` + `pnpm lint` clean (core stays AWS-free; this is the only place AWS SDK is imported besides provider/sst). Behavior tested via mocks in Steps 14.

**Commit**: (bundle with Step 14)

---

### Step 13: Functions — `provider.ts` (openexchangerates client) — security.md (App ID secret, no raw-response logging)

**File**: `packages/functions/src/lib/provider.ts`

**Action** (Context7 to confirm openexchangerates response shapes; native `fetch` on Node 22):

- App ID from **`process.env.OPENEXCHANGERATES_APP_ID`** (SST Secret-linked env). **Never** log it; never include it in any returned object or thrown error.
- `fetchLatest(): Promise<{ rates: RatesMap; fetchedAt: string }>` — GET `https://openexchangerates.org/api/latest.json?app_id=…`; on non-2xx or network error **throw `AppError.providerError()`** (caught by handler → cache-fallback logic). Use the response `timestamp` (or now) as `fetchedAt` ISO.
- `fetchCurrencies(): Promise<CurrencyList>` — GET `currencies.json?app_id=…`; same error handling.
- **Errors are caught and translated, never propagated raw** (Edge: malformed/error payload → treat as provider-down). Do not put provider headers or raw bodies into logs or errors (security.md log-redaction).

**Verification**: `pnpm typecheck` + `pnpm lint` clean; behavior tested via fetch mock in Step 14.

**Commit**: (bundle with Step 14)

---

### Step 14: Functions — three handlers + integration tests — Edge Cases table (all provider/cache/stats rows) + Testing Strategy "Integration"

**Files**: `packages/functions/src/convert.ts`, `currencies.ts`, `stats.ts`; tests `test/convert.test.ts`, `test/currencies.test.ts`, `test/stats.test.ts`, `test/respond.test.ts`

**Action — `convert.ts` handler** (orchestration only; logic in core):

1. `reqId`, start timer.
2. Load rate snapshot from cache (`dynamo.getRateSnapshot`). Determine `cacheState` via `core.cacheState`.
3. **Rate-loading policy** (Edge Cases table):
   - cache **fresh** → use it, `stale:false`, no provider call (Constraint #3: never hit provider on every request).
   - cache **absent or expired** → try `provider.fetchLatest()`:
     - success → `putRateSnapshot` (write-back), use fresh, `stale:false`.
     - failure **and** cache present (fresh-or-expired) → serve cache; `stale = (cacheState === 'expired')`, `asOf = fetchedAt` (Edge: provider-down + within-TTL → stale:false; provider-down + expired → stale:true).
     - failure **and** no cache → throw `noRatesAvailable()` (**503**).
4. Build `supported = supportedFromRates(rates)`; `parseConvertRequest(query, supported)` → typed request (throws `AppError` mapped to 400 on bad input; missing-param precedence honored).
5. `convert(amount, from, to, rates)` → `{ result, rate }`; build `ConvertResult` (strings, `asOf`, `stale`).
6. **Stats** (only on a successful 200; Decision #3 — includes `from==to`): compute `usdValue`, call `dynamo.recordConversion(to, usdValue.toString())`. **Wrap in try/catch — a stats write failure must NOT fail the conversion**; log it and return 200 (Edge: stats write fails after success → still 200).
7. Return `ok(result)`. Any unexpected throw → `fail(err)` → 500 generic.

**Action — `currencies.ts` handler**:

- Load currency list from cache (24h TTL). fresh → serve `stale:false`. absent/expired → `provider.fetchCurrencies()`: success → cache + serve; failure + cache present → serve cached, `stale:true`; failure + no cache → `noRatesAvailable()` (**503**) (Edge: currency-list provider fails, no cache → 503).

**Action — `stats.ts` handler**:

- `dynamo.getStats()` → `core.buildStatsResponse(item)` → `ok(...)`. Empty → `{ totalCount:0, totalSumUSD:'0', topCurrency:null }`.

**Action — integration tests** (mock `./lib/dynamo`, `./lib/provider` with `vi.mock`; **never** hit live AWS/provider — Testing Strategy):

- `convert.test.ts`: (a) cache **hit** → provider **not** called, `stale:false`; (b) cache **miss** → provider fetched + `putRateSnapshot` called (write-back) + `stale:false`; (c) provider-down + **fresh** cache → `stale:false`, 200; (d) provider-down + **expired** cache → `stale:true` + `asOf===fetchedAt`, 200; (e) provider-down + **no** cache → **503 `NO_RATES_AVAILABLE`**; (f) `from==to` → 200, `rate:'1'`, `result===amount`, and **`recordConversion` IS called** (counts in stats); (g) each 400 row (missing param, unsupported, bad amount, cap) → correct `code` + status, body is `{error:{code,message}}`, **no stack trace**; (h) successful convert issues **exactly one** `recordConversion` call with the right `to` + usdValue; (i) **stats write throws** → conversion still **200** (assert `recordConversion` rejected but response status 200).
- `currencies.test.ts`: cache hit; provider-fetch-and-cache; provider-fail-with-cache (`stale:true`); provider-fail-no-cache (**503**).
- `stats.test.ts`: empty state → zeros/null; populated state maps through; **tie-break** top-currency determinism (`{EUR:3,AUD:3}→'AUD'`).
- `respond.test.ts`: error body shape `{error:{code,message}}`; **no `stack`/internal field leaks** for a non-AppError → generic `500 INTERNAL`; **security headers present** (`X-Content-Type-Options`, etc.); **CORS header present** and equals an allowlisted origin, not `*` for a disallowed origin.

**Verification**: `pnpm test` — all functions tests green; `pnpm typecheck` + `pnpm lint` clean.

**Commit**: `feat(functions): convert/currencies/stats handlers with mocked integration tests`

---

### Step 15: Scaffold `web/` Next.js app (App Router)

**Files**: `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/app/layout.tsx`, `web/app/globals.css`

**Action** (pull Next.js App Router docs via Context7 first):

- `package.json`: `name: "@currency/web"`, `next`/`react`/`react-dom` deps, scripts `"dev":"next dev"`, `"build":"next build"`, `"start":"next start"`. Optional dep on `@currency/core` (`workspace:*`) **for types only** (do NOT pull core's runtime into the client bundle if it drags AWS — core is AWS-free so types are safe).
- `tsconfig.json`: Next's recommended config extending base where compatible (Next manages its own tsconfig; keep `strict`). Add `{ "path": "web" }` to root `tsconfig.json` `references` **only if** it participates in `tsc -b` cleanly; otherwise exclude web from `tsc -b` and rely on `next build` for its typecheck (document the choice in a comment + README). **Decision rule**: prefer letting `next build` own web's typecheck to avoid project-reference friction; do NOT add web to root references if it breaks `tsc -b`.
- `app/layout.tsx` + `globals.css`: minimal root layout (Figma "Web layer" styling at developer judgement).
- `pnpm install`.

**Verification**: `pnpm typecheck` (root) still clean; `pnpm --filter @currency/web build` produces a Next build (or at least `next lint`/typecheck passes).

**Commit**: `chore(web): scaffold Next.js App Router app`

---

### Step 16: Web — typed API client (`lib/api.ts`) — Constraint #6 (browser talks only to OUR API)

**File**: `web/lib/api.ts`

**Action**:

- Read the API base URL from a **public** env var (`NEXT_PUBLIC_API_URL`, set by SST link at build). **No App ID anywhere in web** (security.md: absent from bundle).
- Typed functions: `getCurrencies(): Promise<CurrenciesResponse>`, `convert(from,to,amount): Promise<ConvertResult>`, `getStats(): Promise<StatsResponse>` — all hitting **our** endpoints; on non-2xx, parse the `{error:{code,message}}` envelope and throw a typed client error for the UI to render.
- Reuse the core types (`import type` only).

**Verification**: `next build`/typecheck clean; grep the built bundle (Step 22) shows no App ID.

**Commit**: (bundle with Step 17)

---

### Step 17: Web — UI (form, result card, stats panel) — GOAL §6/§7, spec Frontend; Edge: stale badge

**Files**: `web/app/page.tsx`, `web/components/ConvertForm.tsx`, `web/components/ResultCard.tsx`, `web/components/StatsPanel.tsx`, `web/CLAUDE.md`

**Action** (Next.js App Router server/client component split per Context7):

- `ConvertForm`: amount input, `from`/`to` selects populated from `getCurrencies()`; submit calls `convert()`.
- `ResultCard`: shows `result`, `rate`, `asOf`; **renders a "stale" badge when `stale === true`** (Edge: stale flag surfaced).
- `StatsPanel`: shows `topCurrency`, `totalCount`, `totalSumUSD` from `getStats()`.
- Render the validation `{error:{code,message}}` message on 400; show a friendly unavailable state on 503.
- `web/CLAUDE.md`: nested doc — "talks only to our API via lib/api.ts; never the provider; App ID never in this bundle."

**Verification**: `pnpm --filter @currency/web build` succeeds; manual: form renders, stale badge appears when `stale:true`.

**Commit**: `feat(web): convert form, result card (stale badge), stats panel`

---

### Step 18: Infrastructure — `sst.config.ts` — Decision #9; security.md (least-privilege IAM, throttling, CORS, Secret)

**File**: `sst.config.ts`

**Action** (PULL SST v3 / Ion docs via Context7 FIRST — v2 syntax will not work):

- App config: app name, default stage, **single region** (configurable).
- **Two DynamoDB tables** via `sst.aws.Dynamo`:
  - `RateCache` — PK `PK` (string); **TTL enabled on attribute `ttl`**.
  - `Stats` — PK `PK` (string).
- **SST Secret** for the App ID: `new sst.Secret('OpenExchangeRatesAppId')` → linked to functions as env `OPENEXCHANGERATES_APP_ID`. **Never committed**; set via `sst secret set`.
- **API** (`sst.aws.ApiGatewayV2` or Router) with **3 routes**: `GET /api/convert`, `GET /api/currencies`, `GET /api/stats`, each a `sst.aws.Function` from `packages/functions/src/*.handler`.
- **Least-privilege IAM via `link`** (security.md — NO wildcards):
  - `convert` → **read+write** `RateCache`, **write** `Stats` (+ Secret).
  - `currencies` → **read+write** `RateCache` (+ Secret).
  - `stats` → **read** `Stats` only.
  - If SST `link` grants broader-than-needed actions by default, narrow via a `transform`/permissions override so actions are the specific Get/Put/UpdateItem set — **never `dynamodb:*` or `Resource: *`**.
- **API throttling** (Decision #9): rate ~20 rps / burst ~40 (tunable) via the gateway's throttle settings/transform.
- **CORS allowlist**: deployed site origin + `http://localhost:3000` — **not `*`**.
- **Next.js site** via `sst.aws.Nextjs` pointing at `web/`, with `NEXT_PUBLIC_API_URL` linked to the API URL. Site `link`ed to the API only (no table/secret access).

**Verification**: `pnpm typecheck` clean (sst types). `sst.config.ts` references real handler paths. (Live deploy verified in Step 23.) Confirm no `*` resource/action and no literal App ID anywhere.

**Commit**: `feat(infra): sst.config.ts — 2 DynamoDB tables, API (throttle+CORS), Next.js site, least-priv IAM, App ID Secret`

---

### Step 19: Docs — replace CLAUDE.md §9 deferred list with resolved outcomes; update status notes

**File**: `CLAUDE.md`

**Action** (docs-travel-with-code, CLAUDE.md §8):

- **§9 "Deferred decisions"**: replace the open list with the **resolved outcomes** (Decisions #1–9 from the spec): decimal.js + ROUND_HALF_EVEN; rate TTL 3600s / currency-list 24h; `from==to` **counts** toward stats; single atomic aggregate `PK='STATS#GLOBAL'` (`ADD` + `SET if_not_exists`); typed JSON error envelope `{error:{code,message,details?}}`; full-stack one pass; all four hardening items. Add "Resolved — see ADR-0002…0009."

  **Current value (verified from /mnt/c/Users/Epkone/CurrencyExchange/CLAUDE.md, §9, lines 144–149):**

  ```
  ## 9. Deferred decisions (resolve in an implementation spec, then record here)

  Intentionally open in `GOAL.md`: exact DynamoDB table/key design + atomic-counter mechanism; whether
  `from == to` counts toward stats; formal request/response + error-body schemas; exact cache TTL;
  decimal.js vs dinero.js. Don't invent these silently — decide them in a spec under `specs/` and then
  document the outcome here.
  ```

- **§2 "Project status"**: update from "app code not yet" / "packages/, web/, and sst.config.ts are still to come" to reflect that the full stack now exists (drop the "intended/planned" framing per §1's maintenance rule).
- **§8**: replace "Local dev / deploy: SST … _added when sst.config.ts lands_" and "Frontend … _added with web/_" notes with the real `sst dev`/`sst deploy`/`next` reality.

**Verification**: `pnpm format:check`/Prettier clean on the file; no stale "intended" notes about absent code remain for what now exists.

**Commit**: (bundle with Step 21)

---

### Step 20: Docs — one ADR per resolved decision (0002–0009)

**Files**: `docs/adr/0002-decimal-library-and-rounding.md`, `0003-rate-cache-ttl.md`, `0004-from-equals-to-counts-toward-stats.md`, `0005-stats-key-design-atomic-aggregate.md`, `0006-typed-json-error-envelope.md`, `0007-full-stack-single-pass-build.md`, `0008-production-hardening-controls.md`, `0009-product-boundary-currency-only.md`

**Action**: copy `docs/adr/template.md` (Nygard format, verified) into each; one decision each, Status **Accepted**, Date **2026-06-17**, Deciders "Project owner / interview". Map the 5 originally-deferred items + the additional resolved decisions:

- 0002 — decimal.js + `ROUND_HALF_EVEN` (was "decimal.js vs dinero.js"). Alternatives: dinero.js, native floats.
- 0003 — rate cache TTL 3600s + currency-list 24h (was "exact cache TTL").
- 0004 — `from==to` counts toward stats (was the open question).
- 0005 — single atomic aggregate item `STATS#GLOBAL` via `ADD`/`SET if_not_exists` (was "table/key design + atomic mechanism"). Alternatives: per-currency items, read-modify-write, DynamoDB Streams aggregation.
- 0006 — typed JSON error envelope `{error:{code,message,details?}}` (was "formal request/response + error-body schemas").
- 0007 — full-stack single-pass build scope.
- 0008 — production hardening: structured+redacted logging, API throttling, CORS allowlist, security headers + input caps, least-privilege IAM (ties to security.md).
- 0009 — product boundary: currency conversion only.

Then update `docs/adr/README.md`: **check off** the 5 boxes in "Open decisions awaiting an ADR" (verified present, lines under that heading) and **add index entries** for ADR-0002…0009.

**Verification**: every ADR follows the template sections (Context/Decision/Consequences/Alternatives); README index lists 0001–0009; Prettier clean.

**Commit**: (bundle with Step 21)

---

### Step 21: Docs — README setup + security.md checklist sync

**Files**: `README.md`, `docs/security.md`

**Action — `README.md`** (fill the `_TODO_` sections, verified present): real **local setup** (`pnpm install`; **`sst secret set OpenExchangeRatesAppId <id>`** for the App ID — emphasize it never reaches the browser; `sst dev` for local; `sst deploy` for the live URL); **Testing** section (`pnpm test` — unit in core, mocked integration in functions; never hits live AWS/provider); update the "Status: greenfield/scaffolding" banner; flip the `[x]`/`[ ]` deliverables that now hold.

**Action — `docs/security.md`** (docs-travel-with-code, §8): verify each **pre-submission checklist** box is now satisfiable against the shipped code and annotate where each control lives (Zod in `core/validate.ts`; least-priv IAM in `sst.config.ts`; log redaction in `functions/lib/respond.ts`+`provider.ts`; `pnpm audit` in CI; throttling in `sst.config.ts`; gitleaks workflow). Update the "(planned)" markers in the threat→control "Where" column to point at the real files. Do **not** weaken any control.

**Verification**: Prettier clean; README setup steps are runnable; every security.md checklist item maps to a named file/CI job.

**Commit**: `docs: record resolved decisions (ADR 0002–0009), update CLAUDE.md §9, README setup, security checklist`
(this single commit bundles Steps 19–21 so the doc layers land together per anti-drift)

---

### Step 22: CI — verify audit + enable build line; full local gate

**File**: `.github/workflows/ci.yml`

**Action**:

- **Verify** `pnpm audit --audit-level=high` is present (it **is** — verified at line `- run: pnpm audit --audit-level=high`). No change needed there; if a high/critical advisory surfaces from the new deps, resolve it (upgrade/override) so CI stays green.
- **Enable** the commented build step now that packages emit output.

  **Current value (verified from /mnt/c/Users/Epkone/CurrencyExchange/.github/workflows/ci.yml):**

  ```yaml
  - run: pnpm audit --audit-level=high # fail only on high/critical advisories
  # - run: pnpm build   # enable once a workspace package produces build output
  ```

  **After:** uncomment a working build invocation (e.g. add a root `"build"` script that runs `tsc -b` + per-workspace builds, or `pnpm -r build`), confirming it succeeds locally first.

- Run the **entire local gate**: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit --audit-level=high`, and the chosen build.

**Verification**: all of the above pass locally; `pnpm audit --audit-level=high` is clean (no high/critical from decimal.js/zod/@aws-sdk/next).

**Commit**: `ci: enable build step now that workspaces emit output`

---

### Step 23: Live deploy + security verification (Definition of Done)

**Files**: none (operational) — produces the live URL artifact for the README/diary.

**Action**:

- `sst secret set OpenExchangeRatesAppId <real-id>` (per stage), then `sst deploy`.
- Smoke-test the three endpoints against the live URL: a valid `/api/convert` (e.g. EUR→JPY), a 400 (bad amount → `{error:{code:'INVALID_AMOUNT'...}}`), `/api/currencies`, `/api/stats`.
- **Security verification (security.md pre-submission checklist):**
  - `gitleaks` green (no App ID in history) — the secret-scan workflow + local check.
  - **App ID absent from the web bundle**: grep `web/.next`/built output for the real App ID and for `openexchangerates` direct calls — must be absent.
  - **App ID absent from logs**: confirm CloudWatch logs carry only the redacted structured shape (`reqId,route,from,to,cacheHit,stale,status,ms`), no App ID / raw provider body.
  - **IAM least-privilege**: inspect the deployed function roles — specific table ARNs + Get/Put/UpdateItem only, **no `*`**.
  - **Throttling** configured on the API; **CORS** rejects a non-allowlisted origin.
  - `pnpm audit --audit-level=high` clean; lockfile committed.

**Verification**: live URL serves all three endpoints + the Next.js site; every security checklist box verified true.

**Commit**: none required (operational); record the live URL in README/diary in a follow-up doc commit if desired.

---

## Post-Implementation Checklist

Each item below is realized by a numbered Step (Phase 3.5 testing-strategy rule).

- [ ] `pnpm typecheck` clean across all project references (Steps 1,10,15,18,22).
- [ ] `pnpm lint` clean — incl. **core imports no AWS/framework** and **no `parseFloat` on money** (enforced; Steps 4,6,7,9).
- [ ] `pnpm format:check` clean (Step 22).
- [ ] `pnpm test` green — core **unit** tests (Step 8) + functions **integration** tests (Step 14).
- [ ] `pnpm audit --audit-level=high` clean; lockfile committed (Steps 1,10,22).
- [ ] Build step runs (Step 22).
- [ ] **Every Edge Cases row** has an implementation step AND a test (see mapping table below).
- [ ] **decimal.js + ROUND_HALF_EVEN**; round only at end to target dp; JPY=0 (Steps 4,7,8).
- [ ] **USD triangulation** + **USD-normalized stats** (Steps 7,8,14).
- [ ] **Atomic single `UpdateItem`** stats; `from==to` counts; stats-write-failure → still 200 (Steps 12,14).
- [ ] **Typed error envelope** `{error:{code,message,details?}}`; generic 500; **no stack traces** (Steps 6,11,14).
- [ ] **Rate cache TTL 3600s / currency 24h**; fresh/expired/absent policy; **503 only when no cache ever** (Steps 7,12,14).
- [ ] **Zod** boundary validation → `AppError`, never raw Zod (Steps 6,8).
- [ ] **Least-privilege IAM (no wildcards)**; **throttling**; **CORS allowlist**; **security headers**; **structured redacted logging** (no App ID / raw provider) (Steps 11,18,23).
- [ ] **App ID only via SST Secret**; absent from web bundle + logs; **gitleaks green** (Steps 13,16,18,23).
- [ ] **CLAUDE.md §9** replaced with resolved outcomes; **§2/§8** status updated (Step 19).
- [ ] **One ADR per decision** 0002–0009; ADR README open-list checked off + index updated (Step 20).
- [ ] **README** setup (SST Secret, sst dev/deploy, testing) updated (Step 21).
- [ ] **docs/security.md** checklist verifiable against code; "Where" markers point at real files (Step 21).
- [ ] **Live URL** serves 3 endpoints + Next.js site (Step 23).

### Edge Cases → Step + Test mapping (authoritative table; every row covered)

| Edge Case (spec, authoritative)                                       | Impl Step | Test                                                      |
| --------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `from`/`to` missing → 400 `MISSING_PARAM`                             | 6         | 8 (validate), 14 (convert)                                |
| `from`/`to` not `[A-Z]{3}` / unsupported → 400 `UNSUPPORTED_CURRENCY` | 5,6       | 8, 14                                                     |
| `amount` missing → 400 `MISSING_PARAM`                                | 6         | 8, 14                                                     |
| `amount` non-numeric/NaN/Inf/neg/zero → 400 `INVALID_AMOUNT`          | 6         | 8, 14                                                     |
| `amount` > 1e15 or > 20 sig digits → 400 `INVALID_AMOUNT`             | 6         | 8, 14                                                     |
| `from == to` → 200, result=amount, rate 1, counts in stats            | 7,14      | 8 (convert), 14 (handler asserts recordConversion called) |
| Provider down, cache within TTL → 200, `stale:false`                  | 7,14      | 14                                                        |
| Provider down, cache expired → 200, `stale:true`, `asOf`              | 7,14      | 14                                                        |
| Provider down, no cache → 503 `NO_RATES_AVAILABLE`                    | 14        | 14                                                        |
| Provider malformed payload + cache → cache fallback                   | 13,14     | 14                                                        |
| Provider malformed payload + no cache → 503                           | 13,14     | 14                                                        |
| Non-2-dp currency (JPY=0)                                             | 4,7       | 8 (money/convert)                                         |
| Small/large amounts via Decimal, round at end                         | 4,7       | 8                                                         |
| Cross-rate `from != USD` (triangulation)                              | 7         | 8                                                         |
| Stats sum across mixed currencies (USD-normalize)                     | 7,12      | 8, 14                                                     |
| Concurrent stats → single atomic `UpdateItem`                         | 12        | 14 (asserts one UpdateItem + expression)                  |
| Stats write fails after convert → still 200                           | 14        | 14                                                        |
| Currency-list provider fails + cache → serve, `stale`                 | 14        | 14 (currencies)                                           |
| Currency-list provider fails, no cache → 503                          | 14        | 14 (currencies)                                           |
| Any unexpected exception → 500 `INTERNAL`, no stack trace             | 11,14     | 14 (respond)                                              |

---

## Verification Approach

- After **each TypeScript file change**: `pnpm typecheck` (and `pnpm lint` for core/functions to catch the AWS-import + parseFloat invariants early).
- After **each core or functions test step**: `pnpm test` (expect the new suite green; never calls live provider/AWS — provider + dynamo are `vi.mock`-ed).
- After **web steps**: `pnpm --filter @currency/web build`.
- After **infra step**: `pnpm typecheck`; full live verification at Step 23 (`sst deploy` + endpoint smoke tests + security checklist).
- Before **each commit**: the Husky gate runs automatically (pre-commit lint-staged, commit-msg commitlint, pre-push typecheck). **Never** `git commit --no-verify` (a `PreToolUse` hook blocks it; do not attempt to bypass).
- Final gate (Step 22): `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm audit --audit-level=high && <build>`.

---

## Commit Message (draft — overall feature, for reference)

```
feat: serverless currency converter — core, lambdas, web, SST infra

Implement the full stack per spec--2026-06-17--14-17: pure decimal.js
conversion/validation/cache/stats logic in @currency/core (ROUND_HALF_EVEN,
USD triangulation, USD-normalized stats), thin Lambda adapters in
@currency/functions (convert/currencies/stats) over a TTL'd DynamoDB rate
cache and a single atomic STATS#GLOBAL aggregate item, a Next.js web app
that talks only to our API, and sst.config.ts defining two DynamoDB tables,
the API (throttling + CORS allowlist), the site, an App-ID Secret, and
least-privilege IAM. Typed JSON error envelope, Zod boundary validation,
structured redacted logging, and security headers throughout. Resolves the
five deferred decisions (ADR 0002–0009; CLAUDE.md §9), updates README setup,
and verifies the docs/security.md pre-submission checklist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

> The implementing agent commits **per step (or small group)** with the per-step Conventional-Commits messages above — this overall message is a reference summary, not a single squash.
