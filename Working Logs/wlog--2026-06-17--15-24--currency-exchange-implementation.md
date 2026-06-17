# Working Log: Currency Exchange — Full Stack Implementation

**Date**: 2026-06-17
**Worktree**: /mnt/c/Users/Epkone/CurrencyExchange (main repo — no worktree; project commits directly to main)
**Impl plan**: Implementation Plans/impl--2026-06-17--14-35--currency-exchange-implementation.md

## Changes Made

### packages/core (new)

- `packages/core/package.json`: Scaffold @currency/core with decimal.js + zod deps, build/test scripts
- `packages/core/tsconfig.json`: Extends tsconfig.base.json, emits to dist/, types: ["node"] for process.stderr
- `packages/core/vitest.config.ts`: Vitest project config for test discovery
- `packages/core/src/types.ts`: Shared API + record types (ConvertResult, StatsResponse, etc.)
- `packages/core/src/money.ts`: Decimal.set(ROUND_HALF_EVEN), CURRENCY_DP table, dpFor(), roundToCurrency(), formatMoney()
- `packages/core/src/currencies.ts`: isWellFormedCode(), isSupported(), supportedFromRates()
- `packages/core/src/errors.ts`: AppError class + named constructors (missingParam, unsupportedCurrency, etc.)
- `packages/core/src/validate.ts`: parseConvertRequest() — Zod-backed with missing-param-first precedence
- `packages/core/src/convert.ts`: rateBetween(), convert() (from==to short-circuit), usdValue()
- `packages/core/src/rates.ts`: cacheState(), RATE_TTL_SECONDS=3600, CURRENCY_TTL_SECONDS=86400
- `packages/core/src/stats.ts`: topCurrency() (tie→lex-smallest), buildStatsResponse()
- `packages/core/src/index.ts`: Barrel export of all public surface
- `packages/core/test/money.test.ts`: dpFor, roundToCurrency (ROUND_HALF_EVEN boundaries), formatMoney
- `packages/core/test/convert.test.ts`: USD→USD, USD→EUR, EUR→JPY triangulation, usdValue, large/small amounts
- `packages/core/test/validate.test.ts`: All MISSING_PARAM, UNSUPPORTED_CURRENCY, INVALID_AMOUNT cases
- `packages/core/test/rates.test.ts`: cacheState fresh/expired/absent for both TTLs
- `packages/core/test/stats.test.ts`: topCurrency (tie-break), buildStatsResponse (null, empty, populated)
- `packages/core/CLAUDE.md`: Per-package agent doc

### packages/functions (new)

- `packages/functions/package.json`: @currency/functions with @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, @currency/core
- `packages/functions/tsconfig.json`: Extends base, references core
- `packages/functions/vitest.config.ts`: Vitest project config
- `packages/functions/src/lib/respond.ts`: ok(), fail() (AppError envelope, non-AppError→500), baseHeaders() (security headers, CORS allowlist), logEvent()
- `packages/functions/src/lib/dynamo.ts`: getRateSnapshot/putRateSnapshot, getCurrencyList/putCurrencyList, recordConversion (atomic UpdateItem), getStats
- `packages/functions/src/lib/provider.ts`: fetchLatest(), fetchCurrencies() — App ID from env, errors caught+translated, never logged
- `packages/functions/src/convert.ts`: Full cache+provider orchestration, stats best-effort, 400/503 handling
- `packages/functions/src/currencies.ts`: Currency list handler with cache+provider fallback
- `packages/functions/src/stats.ts`: Stats handler — reads and formats via buildStatsResponse
- `packages/functions/test/respond.test.ts`: ok/fail envelope, security headers, CORS allowlist, stack trace absence
- `packages/functions/test/convert.test.ts`: Cache hit/miss, provider-down+fresh, provider-down+expired, provider-down+no-cache(503), from==to, all 400s, stats write failure→200
- `packages/functions/test/currencies.test.ts`: Cache hit, fetch+cache, provider-fail+stale, provider-fail+no-cache(503)
- `packages/functions/test/stats.test.ts`: Empty state, populated, tie-break
- `packages/functions/CLAUDE.md`: Per-package agent doc

### web (new)

- `web/package.json`: @currency/web with next, react, react-dom, @currency/core types
- `web/tsconfig.json`: Next.js-compatible tsconfig (not in root references — next build owns typecheck)
- `web/next.config.mjs`: Minimal config
- `web/css.d.ts`: CSS module type declaration for layout.tsx import
- `web/app/layout.tsx`: Root layout with metadata
- `web/app/globals.css`: Full styling (card, form, result, stale badge, stats grid)
- `web/app/page.tsx`: Home page — ConvertForm + StatsPanel (with Suspense)
- `web/lib/api.ts`: Typed fetch wrappers for /api/convert, /api/currencies, /api/stats (no App ID)
- `web/components/ConvertForm.tsx`: Client component — form + result display + stale badge + error/unavailable states
- `web/components/ResultCard.tsx`: Reusable result card with stale badge
- `web/components/StatsPanel.tsx`: Server component — fetches /api/stats
- `web/CLAUDE.md`: Per-package agent doc

### Infrastructure (new)

- `sst.config.ts`: SST Ion config — RateCache table (TTL on `ttl`), Stats table, 3 Lambda functions with least-priv link[], ApiGatewayV2 (throttle 20rps/40burst, CORS allowlist), Nextjs site, Secret for App ID

### Modified root config

- `tsconfig.json`: Added references for packages/core and packages/functions
- `package.json`: Added `build` script (pnpm -r --filter core+functions build); added pnpm.overrides for postcss>=8.5.10; added sst devDep
- `vitest.config.ts` (new): Root Vitest projects config
- `eslint.config.js`: Added web/next-env.d.ts and sst.config.ts to ESLint ignore list (generated files with triple-slash refs)
- `.github/workflows/ci.yml`: Enabled `pnpm build` step (was commented)
- `pnpm-lock.yaml`: Updated with all new deps

### Docs (modified)

- `CLAUDE.md`: Updated §2 (full stack shipped), §4 (resolved to real arch), §5 (decimal.js+ROUND_HALF_EVEN), §8 (real commands), §9 (resolved decisions table replacing deferred list)
- `README.md`: Filled all _TODO_ sections — local setup, SST secret, sst dev/deploy, testing, deliverables checklist
- `docs/security.md`: Updated threat→control "Where" column with real file paths; pre-submission checklist with file annotations
- `docs/adr/README.md`: Checked off all 5 open decisions; added index entries for ADR-0002–0009
- `docs/adr/0002-decimal-library-and-rounding.md`: New ADR
- `docs/adr/0003-rate-cache-ttl.md`: New ADR
- `docs/adr/0004-from-equals-to-counts-toward-stats.md`: New ADR
- `docs/adr/0005-stats-key-design-atomic-aggregate.md`: New ADR
- `docs/adr/0006-typed-json-error-envelope.md`: New ADR
- `docs/adr/0007-full-stack-single-pass-build.md`: New ADR
- `docs/adr/0008-production-hardening-controls.md`: New ADR
- `docs/adr/0009-product-boundary-currency-only.md`: New ADR

## Errors Encountered

### Error 1: console not found in tsconfig.base.json ES2022 lib (Step 4, attempt 1/2)

- **Attempt 1**: Used `console.warn()` in money.ts — failed because tsconfig.base.json uses `"lib": ["ES2022"]` without DOM, so `console` is undefined.
- **Attempt 2**: Switched to `process.stderr.write()` — also failed because `@types/node` was not in the core package's tsconfig. Added `"types": ["node"]` to packages/core/tsconfig.json — resolved.

### Error 2: Small amount test assertion wrong (Step 8, attempt 1/2)

- **Attempt 1**: Test asserted `result.result.gt(0)` for 0.000001 USD → EUR, but 0.000001 \* 0.92 = 0.00000092, which rounds to 0.00 at 2dp. The assertion was wrong (the description says "stays exact through Decimal" not "result > 0").
- **Attempt 2**: Fixed assertion to only check `isFinite()` and the rate value (which is unaffected by rounding). Documented as a plan deviation.

### Error 3: Next.js module resolution — .js extension (Step 15, attempt 1/2)

- **Attempt 1**: Used `from '../components/ConvertForm.js'` style imports in page.tsx — Next.js webpack can't resolve .tsx files via .js extensions.
- **Attempt 2**: Changed all Next.js internal imports to extensionless (`from '../components/ConvertForm'`). Resolved.

### Error 4: Next.js CSS import type error (Step 15, attempt 2/3)

- **Attempt 2**: After fixing module resolution, `import './globals.css'` in layout.tsx caused a TypeScript error because Next.js's `next-env.d.ts` had not generated the CSS type declaration yet.
- **Attempt 3**: Created `web/css.d.ts` with `declare module '*.css'`. Resolved.

### Error 5: ESLint triple-slash-reference errors (Steps 15+18)

- `web/next-env.d.ts` and `sst.config.ts` use triple-slash references — ESLint's `@typescript-eslint/triple-slash-reference` rule blocked them. Both are generated/framework-required files.
- Fixed by adding both to ESLint ignores in `eslint.config.js`.

### Error 6: Commit message too long (Step 18)

- First commit message for sst.config.ts was 112 chars (limit 100). Shortened to fit.

### Error 7: PostCSS moderate vulnerability (Step 22)

- `pnpm audit` found a moderate PostCSS XSS advisory in `web>next>postcss`. Added `pnpm.overrides.postcss: ">=8.5.10"` to root package.json. `pnpm install` updated the lockfile. `pnpm audit` is now clean.

## Deviations from Plan

1. **Small amount test assertion** (Step 8): The plan's test "small amount (0.000001) stays exact through Decimal" had `expect(result.result.gt(0)).toBe(true)` which is incorrect — 0.000001 \* 0.92 rounds to 0.00 at 2dp. Fixed assertion to check `isFinite()` + the rate (both remain correct). Per impl.md "correcting buggy test assertions" rule, the comment/description is the authoritative intent.

2. **vitest.config.ts in packages/core** (not in plan scope but required for test discovery): The root `vitest.config.ts` uses the "projects" glob pattern; per-package `vitest.config.ts` files are needed to make it work. Added `packages/core/vitest.config.ts` and `packages/functions/vitest.config.ts` (both are minimal `defineConfig` files within the spirit of Step 2's intent).

3. **web/css.d.ts** (not in plan scope): Required to fix Next.js CSS import type error. One-line type declaration file. Added to ESLint ignore as it's framework glue.

4. **web/next-env.d.ts** (plan says "generated; do not hand-edit"): Generated by Next.js during `next build`. Added to ESLint ignore list.

5. **Step 23 (live deploy)**: Deferred — requires live AWS credentials and a real openexchangerates App ID. `sst.config.ts` type-checks with SST installed. To deploy: `sst secret set OpenExchangeRatesAppId <id>` then `sst deploy`. Security verification (gitleaks, bundle grep, CloudWatch logs, IAM inspection) must be done after deploy.

6. **sst.config.ts ESLint ignore**: Added `sst.config.ts` to ESLint ignores because SST Ion uses a triple-slash `/// <reference path="./.sst/platform/config.d.ts" />` that is generated at `sst install` time. Without it, the `@typescript-eslint/triple-slash-reference` rule errors. This is standard SST Ion pattern.

7. **PostCSS override**: Added `pnpm.overrides.postcss: ">=8.5.10"` to root package.json to resolve a moderate severity advisory. Not in plan scope but required for audit cleanliness.

8. **`web/` not in root tsconfig references**: Per the plan's explicit decision rule ("prefer letting `next build` own web's typecheck"), `web/` is excluded from root `tsc -b`. `next build` typechecks it. This is documented in `web/CLAUDE.md` and `CLAUDE.md §8`.

## Verification

- Build / typecheck: `pnpm typecheck` — OK (core + functions). `pnpm --filter @currency/web build` — OK (Next.js 15.5.19 built successfully).
- Tests: 95 passed, 0 failed across 9 test files (5 core unit, 4 functions integration)
- Format: `pnpm format:check` — OK (Prettier clean)
- Lint: `pnpm lint` — OK (ESLint clean; core AWS-free + no-parseFloat invariants enforced)
- Audit: `pnpm audit --audit-level=high` — OK (no high/critical; moderate PostCSS resolved via override)
- Build: `pnpm build` — OK (tsc -b on core + functions)
- Step 23 (live deploy): Deferred — requires runtime AWS credentials and App ID secret.
