# packages/core — Agent Notes

**Pure logic only. NO `@aws-sdk/*`, `sst`, `next`, or any AWS/framework imports. ESLint enforces this.**

This package is the business logic layer: currency conversion math, input validation, rate cache policy, and stats domain. It has zero cloud dependencies and is fully unit-tested in isolation.

## Key invariants

- All money arithmetic goes through `Decimal` from `decimal.js` with `ROUND_HALF_EVEN` configured globally.
- Round **only at the end** of a calculation, to the **target** currency's decimal places (`dpFor(code)`).
- Never use `parseFloat`, `Number()`, or native JS floats for money. ESLint blocks `parseFloat`.
- `parseConvertRequest` throws `AppError` — never a raw `ZodError`. Map Zod issues before propagating.

## Public exports (`src/index.ts`)

- **Types**: `Currency`, `RatesMap`, `RateSnapshot`, `CurrencyList`, `ConvertResult`, `CurrenciesResponse`, `StatsResponse`, `ParsedConvertRequest`
- **Errors**: `AppError`, `missingParam`, `unsupportedCurrency`, `invalidAmount`, `noRatesAvailable`, `providerError`, `internalError`, `ErrorCode`
- **Money**: `Decimal`, `CURRENCY_DP`, `dpFor`, `roundToCurrency`, `formatMoney`
- **Currencies**: `isWellFormedCode`, `isSupported`, `supportedFromRates`
- **Validation**: `parseConvertRequest`
- **Conversion**: `rateBetween`, `convert`, `usdValue`
- **Cache policy**: `cacheState`, `RATE_TTL_SECONDS`, `CURRENCY_TTL_SECONDS`, `CacheState`
- **Stats**: `topCurrency`, `buildStatsResponse`

## Test commands

```bash
pnpm test          # all tests (from repo root)
pnpm typecheck     # tsc -b (from repo root)
pnpm lint          # ESLint (from repo root)
```
