# Spec: Currency Exchange — Implementation

**Status:** Ready to implement (no blocking open questions)
**Author:** Clarifier Agent (interview-driven)
**Date:** 2026-06-17
**Supersedes deferred decisions in:** `GOAL.md` §10 and `CLAUDE.md` §9 (all five resolved below)
**Build scope (this pass):** Full stack — `packages/core` + `packages/functions` + DynamoDB + `web/` (Next.js) + `sst.config.ts` (live AWS deploy).

---

## Goal

Turn the `GOAL.md` north-star into a **buildable, production-grade currency converter** for a
trader/broker context: a serverless REST API (AWS Lambda + SST) that converts money using live,
cached exchange rates; persists concurrency-safe usage stats in DynamoDB; and is fronted by a
Next.js web app. "Production-grade" here means **money-correctness, input validation, security, and
test coverage are first-class** — not polish. This spec resolves every deferred decision so the
implementation can proceed without further interviews.

"Securities" in the request is interpreted as **security + fintech-correctness rigor** for a system
that handles money — **not** building actual securities/asset trading. The product boundary stays
exactly as `GOAL.md` defines: `/convert`, `/currencies`, `/stats`. (Scope guard confirmed in
interview.)

---

## Current State

- Repo is **toolchain-in, app-code-pending**. Wired: pnpm workspaces, Node 22 (`.nvmrc`),
  TypeScript project references (`tsconfig.base.json` with `strict` + `noUncheckedIndexedAccess`),
  ESLint (flat config, incl. the two custom invariants: no AWS imports in `core`, no `parseFloat` on
  money), Prettier, Husky gates (pre-commit lint-staged, commit-msg commitlint, pre-push typecheck),
  CI (`.github/workflows/ci.yml`), gitleaks secret-scan.
- **No app code exists:** `packages/`, `web/`, `sst.config.ts` are all absent.
- `GOAL.md` is the authoritative vision; this spec is the authoritative mechanism.
- **Git policy (project override):** commit **directly to `main`** — no branches/worktrees/PRs
  (`CLAUDE.md` "Repository workflow"). The pipeline's worktree step is **skipped** for this repo;
  work happens on `main`.

---

## Decisions

All confirmed during the interview. These are binding.

| #  | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| 1  | **Build scope this pass** | Full stack in one pass | core + functions + DynamoDB + Next.js + SST deploy. |
| 2  | **Decimal library** | **decimal.js** | Lightweight, explicit precision/rounding control; clean fit for USD-triangulation ratio math. Money held as `Decimal` internally, formatted to currency dp only at the boundary. |
| 3  | **`from == to` counts toward stats** | **Yes** | A `from==to` request is a valid 200 conversion (rate 1); it increments count, adds its USD value to the sum, and bumps that target currency's frequency. Rule: *every 200 from `/convert` counts.* |
| 4  | **Stats key design + atomic mechanism** | **Single atomic aggregate item** | `PK='STATS#GLOBAL'`; one atomic `UpdateItem` per conversion (`ADD` counters + `SET` map increment). Concurrency-safe by construction; no read-modify-write. Top currency computed in-app from the map. |
| 5  | **Money rounding mode** | **Banker's / `ROUND_HALF_EVEN`** | Minimizes cumulative bias across aggregates — the financial standard; keeps the USD-normalized stats sum unbiased. |
| 6  | **Rate cache TTL** | **3600s (1 hour)** | Matches the provider's hourly refresh. DynamoDB TTL = `fetchedAt + 3600`. |
| 7  | **API contract / error body** | **Typed JSON envelope** | Success returns the resource directly; errors always `{ error: { code, message, details? } }` with a stable machine-readable `code`. Never leaks stack traces. |
| 8  | **Product boundary** | **Currency conversion only** | No securities/asset trading; security & correctness rigor applied to the money system. |
| 9  | **Production hardening** | **All four:** structured logging + request IDs, API throttling, CORS allowlist, security headers + input caps | Mandated below in Technical Design. |

### Assumed (sensible defaults, non-output-changing — see Open Questions to override)

- **Currency-list cache TTL: 24h** (names rarely change; lives in the cache table under its own PK).
- **Amount is parsed from the query string with `Decimal`, never `parseFloat`/`Number`** (precision + ESLint invariant).
- **`totalSumUSD` stored as a DynamoDB `Number`** (arbitrary-precision decimal — money-safe), written via `ADD` with a decimal string, read back wrapped in `Decimal`.
- **Provider App ID via SST Secret** (`openexchangerates` `app_id`), never in the frontend bundle.
- **Region:** a single AWS region (SST default / configurable); not multi-region.

---

## Technical Design

### Monorepo layout (target)

```
/packages/core/          # pure logic — NO aws-sdk / next / sst imports (ESLint-enforced)
  src/
    money.ts             # Decimal helpers, currency dp table, banker's rounding, format
    convert.ts           # USD triangulation: result = amount * (rates[to]/rates[from])
    validate.ts          # input validation -> typed errors (codes below)
    rates.ts             # cache-policy logic: fresh? stale? no-cache? (pure; takes a clock)
    stats.ts             # stats domain: compute top target from a counts map; USD normalize
    currencies.ts        # supported-currency set helpers
    errors.ts            # AppError { code, httpStatus, message } union
    types.ts             # shared request/response + record types (re-exported to web/functions)
  test/                  # Vitest unit tests (math, rounding, cache policy, validation)

/packages/functions/     # thin Lambda adapters over core — NO business logic here
  src/
    convert.ts           # GET /api/convert
    currencies.ts        # GET /api/currencies
    stats.ts             # GET /api/stats
    lib/
      dynamo.ts          # DynamoDB doc-client wrappers (cache get/put, stats update/get)
      provider.ts        # openexchangerates client (latest.json, currencies.json)
      respond.ts         # envelope + headers + structured logging helpers
  test/                  # Vitest integration tests (handlers, provider + dynamo mocked)

/web/                    # Next.js (App Router), deployed via SST/OpenNext
  app/                   # convert form + result + stats panel (Figma "Web layer")
  lib/api.ts             # typed client hitting OUR API (never the provider)

/sst.config.ts           # IaC: 2 DynamoDB tables, API (3 routes, throttling, CORS), Next.js site, Secret
```

> **Dependency rule (the whole point of the structure):** `packages/core` imports no AWS/framework
> code. `functions` are adapters; `web` talks only to our API. Code sketches below are
> **illustrative** — where any sketch conflicts with the **Edge Cases** table, that table wins.

### Money & conversion (`core/money.ts`, `core/convert.ts`)

- All money is `Decimal`. The only `number`s allowed are exchange rates as received and array
  indices — rates are immediately wrapped in `Decimal` before any arithmetic.
- **Currency decimal places**: a small table (`USD:2, EUR:2, JPY:0, …`). Derive dp per ISO-4217;
  **never hardcode 2**. Unknown but provider-supported currencies default to 2 with a logged warning.
- **Conversion:** `result = new Decimal(amount).mul(rate(to)).div(rate(from))`, where
  `rate(USD) = 1`. Round **only at the end** to the **target** currency's dp using `ROUND_HALF_EVEN`.
- **`from == to`:** short-circuit to `{ result: amount (rounded to from's dp), rate: 1 }` — still a
  valid 200 and still counted in stats (Decision #3).
- **USD normalization for stats:** `usdValue = new Decimal(amount).div(rate(from))` (amount in USD),
  rounded to 2 dp for the stored sum.

### Validation (`core/validate.ts`) — **Zod** at the boundary

Per `docs/security.md`, every request param is validated with **Zod** schemas at the API boundary.
Schemas live in `core` (Zod is a pure lib, allowed by the no-AWS rule) and are invoked by the
handlers. A Zod parse failure is mapped to the typed `AppError` below (never surfaced as a raw Zod
error / stack trace). Pure functions return either a parsed, typed request or an `AppError`. Rules:

| Field | Rule | On failure |
|-------|------|-----------|
| `from`, `to` | required; must match `/^[A-Z]{3}$/` **and** be in the supported set | `400 UNSUPPORTED_CURRENCY` |
| `amount` | required; parse with `Decimal`; must be finite, `> 0`; ≤ `1e15`; ≤ 20 significant digits | `400 INVALID_AMOUNT` |
| `amount` (shape) | reject non-numeric / `NaN` / `Infinity` / empty / leading-junk | `400 INVALID_AMOUNT` |

Input caps (`1e15`, 20 sig digits, 3-letter codes) are the **DoS/abuse guard** (Decision #9).

### Error model (`core/errors.ts`) — typed JSON envelope (Decision #7)

```ts
type ErrorCode =
  | 'INVALID_AMOUNT' | 'UNSUPPORTED_CURRENCY' | 'MISSING_PARAM'
  | 'NO_RATES_AVAILABLE' | 'PROVIDER_ERROR' | 'INTERNAL';
class AppError extends Error { code: ErrorCode; httpStatus: number; details?: unknown }
```

Handlers map `AppError → { statusCode, body: { error: { code, message, details? } } }`. Any
unexpected throw → `500 INTERNAL` with a generic message (**never** a stack trace).

### DynamoDB design

Two tables (per `CLAUDE.md` §4), both single-table-style with a string `PK`.

**1. Rate cache table** (`RateCache`) — TTL-enabled on attribute `ttl` (epoch seconds).

| Item | PK | Attributes |
|------|----|-----------|
| USD rate snapshot | `RATES#USD` | `rates` (map code→rate string), `fetchedAt` (ISO), `ttl` (epoch = fetchedAt+3600) |
| Currency list | `CURRENCIES` | `currencies` (map code→name), `fetchedAt`, `ttl` (epoch = fetchedAt+86400) |

Cache policy (`core/rates.ts`, pure, takes `now`):
- **fresh** if `now < fetchedAt + TTL` → use, `stale:false`.
- **expired** but present → only used as fallback when the provider fails → `stale:true` + `asOf=fetchedAt`.
- **absent** → must fetch; if fetch also fails → `NO_RATES_AVAILABLE` (503).

**2. Stats table** (`Stats`) — single aggregate item (Decision #4).

| PK | Attributes |
|----|-----------|
| `STATS#GLOBAL` | `totalCount` (Number), `totalSumUSD` (Number, decimal string via ADD), `targetCounts` (Map code→Number) |

Atomic write per successful conversion — **one** `UpdateItem`:
```
UpdateExpression:
  ADD totalCount :one, totalSumUSD :usd
  SET targetCounts.#cur = if_not_exists(targetCounts.#cur, :zero) + :one
ExpressionAttributeNames:  { '#cur': <TO currency> }
ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':usd': <usdValue as Number> }
```
Concurrency-safe (each `UpdateItem` is atomic; no read-modify-write). `GET /stats` reads the one
item; **top target currency = `argmax(targetCounts)`** computed in-app (tie → lexicographically
smallest code, deterministic). Empty stats → `count:0, sumUSD:"0", topCurrency:null`.

### REST API surface (response schemas)

`GET /api/convert?from=&to=&amount=` → **200**
```json
{ "from":"EUR","to":"JPY","amount":"100","result":"16234","rate":"162.34","asOf":"2026-06-17T14:00:00Z","stale":false }
```
(`amount`, `result`, `rate` are strings to preserve precision on the wire.)

`GET /api/currencies` → **200** `{ "currencies": { "USD":"United States Dollar", ... }, "asOf":"...", "stale":false }`

`GET /api/stats` → **200** `{ "totalCount":42, "totalSumUSD":"12345.67", "topCurrency":"EUR" }`

All errors → the typed envelope with the appropriate status from the Edge Cases table.

### Functions layer (`packages/functions`)

- Thin handlers: parse query → `core/validate` → load rates (cache→provider→fallback) →
  `core/convert` → atomic stats update (convert only) → envelope response.
- `lib/provider.ts`: calls `latest.json?app_id=…` and `currencies.json`. App ID from SST Secret /
  env. **Provider errors are caught and translated**, never propagated raw.
- `lib/respond.ts`: builds the envelope, attaches **security headers** and **CORS** headers, and
  emits **structured JSON logs** with a per-invocation `reqId` (`{reqId, route, from, to, cacheHit,
  stale, status, ms}`) — **no secrets/PII logged** (Decision #9). Per `docs/security.md`: **never log
  the App ID or raw provider responses/headers**; redact structured logs.
- Stats update failures must **not** fail the conversion response — log and continue (the conversion
  is the user-facing contract; stats are best-effort durable). Provider/cache failures follow the
  Edge Cases table.

### Frontend (`web/`)

- Next.js App Router. A convert form (amount, from-select, to-select populated from
  `/api/currencies`), a result card (shows `result`, `rate`, `asOf`, and a **stale badge** when
  `stale:true`), and a stats panel (`topCurrency`, `totalCount`, `totalSumUSD`). Implements the
  Figma "Web layer" design; exact placement at developer judgement (case study allows it).
- Talks only to **our** API via `lib/api.ts`; the provider App ID never reaches the bundle.

### Infrastructure (`sst.config.ts`)

- Two DynamoDB tables (`RateCache` with TTL on `ttl`; `Stats`), the API with the three routes,
  **API throttling** (e.g. rate 20 rps / burst 40, tunable), **CORS allowlist** (deployed site
  origin + `http://localhost:3000`), the Next.js site (OpenNext), and an SST **Secret** for the
  openexchangerates App ID linked to the functions. IaC is the single source of truth.
- **Least-privilege IAM (per `docs/security.md`):** grant each function access only to the specific
  table(s) and actions it needs via SST `link` — **never wildcard (`*`) resources or actions**. The
  convert handler needs read+write on `RateCache` and write on `Stats`; `/stats` needs read on
  `Stats`; `/currencies` needs read+write on `RateCache`.
- **SST v3 (Ion):** the infra API differs substantially from v2 — pull current docs via the
  **Context7** MCP before writing `sst.config.ts` (`CLAUDE.md` §8). Same for AWS SDK for JS v3
  (DynamoDB client/commands), Next.js App Router, Zod, and decimal.js — do not assume APIs.

---

## Edge Cases & Error Handling — AUTHORITATIVE

Implementers/planners must cross-check every code sketch above against this table; on conflict,
**this table wins.**

| Scenario | Required behavior |
|----------|-------------------|
| `from`/`to` missing | **400 `MISSING_PARAM`** |
| `from`/`to` not `[A-Z]{3}` or not supported | **400 `UNSUPPORTED_CURRENCY`**, meaningful message |
| `amount` missing | **400 `MISSING_PARAM`** |
| `amount` non-numeric / `NaN` / `Infinity` / negative / zero | **400 `INVALID_AMOUNT`** |
| `amount` > `1e15` or > 20 significant digits | **400 `INVALID_AMOUNT`** (DoS/abuse cap) |
| `from == to` | **200**, `result = amount` (rounded to currency dp), `rate: 1`, `stale` per cache freshness; **counts toward stats** |
| Provider down, **cache within TTL** | Serve cached rates, **200**, `stale:false` |
| Provider down, **cache expired** | Serve last-good rates, **200**, `stale:true`, `asOf=fetchedAt` |
| Provider down, **no cache at all** | **503 `NO_RATES_AVAILABLE`** |
| Provider returns malformed/error payload, cache exists | Treat as provider-down → cache fallback rules above |
| Provider returns malformed/error payload, no cache | **503 `NO_RATES_AVAILABLE`** |
| Non-2-dp currency (e.g. JPY=0) | Round to **that** currency's dp via decimal lib; never assume 2 |
| Small/large amounts | All math via `Decimal`; round only at the end to target dp (`ROUND_HALF_EVEN`) |
| Cross-rate `from != USD` | USD triangulation: `amount * (rates[to]/rates[from])` |
| Stats sum across mixed currencies | Normalize each to USD (`amount/rate[from]`) before `ADD` |
| Concurrent stats updates | Single atomic `UpdateItem` (`ADD`/`SET if_not_exists`); never read-modify-write |
| Stats write fails after a successful convert | **Conversion still returns 200**; log the stats failure, do not 500 |
| Currency-list provider call fails, cache exists | Serve cached list, `stale` flag set |
| Currency-list provider call fails, no cache | **503 `NO_RATES_AVAILABLE`** (cannot enumerate currencies) |
| Any unexpected exception | **500 `INTERNAL`**, generic message, **no stack trace**; logged with `reqId` |

---

## Constraints & Invariants

1. **No native-float money math.** All money is `Decimal`; round only at the end to target dp with
   `ROUND_HALF_EVEN`. No `parseFloat`/`Number(amount)` on money (ESLint-enforced).
2. **`packages/core` imports no AWS/framework code** (ESLint-enforced). Business logic lives in core;
   `functions` are thin adapters.
3. **Rate cache is a first-class persistent resource** — read cache first, fetch provider only on
   miss/expiry, write back. Never call the provider on every request.
4. **Availability over freshness** — serve stale cache when the provider is down; only 503 when no
   cache ever existed.
5. **Stats are concurrency-safe and persistent** — atomic DynamoDB updates only.
6. **The openexchangerates App ID is a secret** — SST Secret/env only; never committed, never in the
   frontend bundle. The browser calls our API, not the provider.
7. **Errors never leak internals** — typed envelope, generic 500s, no stack traces in responses.
8. **Git:** commit directly to `main`; docs (this spec's CLAUDE.md updates, ADRs, README, OpenAPI)
   travel in the same commits as the code (anti-drift, `CLAUDE.md` §8).
9. **Product boundary:** `/convert`, `/currencies`, `/stats` only — no securities/asset trading.
10. **Security controls per `docs/security.md` are authoritative** alongside this spec: Zod boundary
    validation, least-privilege IAM (no wildcards), log redaction (no App ID / raw provider
    responses), `pnpm audit --audit-level=high` + committed lockfile, and the pre-submission
    checklist. Treat its threat→control table as binding. `docs/security.md` is a docs-travel-with-code
    layer — update it in the same commit if a control changes.

---

## Testing Strategy

Vitest, provider + DynamoDB mocked — **never** call the live provider or AWS from a test.

**Unit (`packages/core`):**
- Conversion math: USD→USD (rate 1), USD→EUR, EUR→JPY triangulation, JPY 0-dp rounding, large/small
  amounts, banker's-rounding boundary cases (`2.345→2.34`, `2.355→2.36`).
- Validation: each row of the Edge Cases 400 set, including the input caps.
- Cache policy: fresh / expired / absent decisions against an injected clock.
- Stats domain: `argmax(targetCounts)`, tie-break determinism, USD normalization, empty state.

**Integration (`packages/functions`, mocked provider + dynamo):**
- `/convert`: cache hit (no provider call), cache miss (provider fetch + write-back), provider-down
  with fresh cache (`stale:false`), provider-down with expired cache (`stale:true`+`asOf`),
  provider-down no cache (**503**), `from==to`, every 400 case.
- Stats: a successful convert issues exactly one atomic `UpdateItem` with the right expression; a
  failing stats write still returns the conversion 200.
- `/currencies`: cache hit, provider-fetch-and-cache, provider-fail-with-cache, provider-fail-no-cache (503).
- `/stats`: empty state, populated state, top-currency tie-break.
- Envelope/security: error bodies match `{error:{code,message}}`; no stack trace leaks; CORS +
  security headers present.

**Security verification (per `docs/security.md` pre-submission checklist):** `gitleaks` green (no
secrets in history); App ID absent from the web bundle and from logs; every input Zod-validated →
400 with a message, no stack trace; Lambda IAM scoped to specific tables + actions (no wildcards);
`pnpm audit --audit-level=high` clean (committed lockfile); API Gateway throttling configured. Add
`pnpm audit --audit-level=high` to CI.

**Definition of done for this pass:** all of the above green; `pnpm typecheck` + `pnpm lint` clean;
`sst deploy` produces a live URL serving the three endpoints + the Next.js site; README documents
local setup (`pnpm install`, SST Secret for the App ID, `sst dev`); `CLAUDE.md` §9 deferred items
replaced with the resolved decisions and an ADR per decision under `docs/adr/`; `docs/security.md`
checklist boxes verifiable against the code.

---

## Open Questions (non-blocking)

These have sensible defaults (see *Assumed* above); flag if you want different:
- **Currency-list cache TTL** defaulted to **24h** — confirm vs the 1h rate TTL.
- **AWS region / SST stage names** — using SST defaults unless you specify.
- **API throttle numbers** (20 rps / 40 burst) — tune to expectations.
- **Wire format of numeric fields** — chosen as **strings** (`amount`/`result`/`rate`) to preserve
  precision; switch to JSON numbers only if the frontend prefers and accepts float risk.
