# Currency Exchange — Project Goal

> **North-star vision** for the Purple LAB "Backend Developer 2026" case study.
> This document describes *where we are headed and what "done" looks like* — not how to
> build it step by step. It is the artifact we commit before writing code, so that every
> downstream plan and every line of code stays aligned with the same end-state.

---

## 1. Vision

A **deployed, serverless currency converter** where a user enters an amount and a source
currency, selects a target currency, and instantly receives an **accurate** converted result
backed by **live exchange rates** — together with **usage statistics that persist across
sessions and clients**. The whole product lives on a single cloud (AWS), is defined entirely as
infrastructure-as-code, and is fronted by a clean web UI. It should feel fast, be honest about
the freshness of its data, and never give a wrong number because of floating-point sloppiness.

---

## 2. What We're Building

End to end, the finished product behaves like this:

1. **User input** — In the web app (or directly against the API), the user supplies an `amount`,
   a `from` currency, and a `to` currency.
2. **Conversion** — The API converts the amount using **live exchange rates** that are kept in a
   **shared cache**. On a cache hit it answers immediately; on a miss it fetches fresh rates from
   the provider, stores them, and then answers.
3. **Result returned & displayed** — The response carries the converted amount, the exchange rate
   actually used, and an `asOf` timestamp indicating how fresh the rates are. The frontend renders
   the result clearly.
4. **Conversion recorded** — Every successful conversion is persisted durably.
5. **Stats updated & shown** — Aggregate statistics are recomputed/incremented and surfaced in the
   UI, so users can see how the service is being used over time.

The experience is deliberately simple and single-purpose: *amount in → converted amount out, with
trustworthy rates and visible usage stats.*

---

## 3. Target Level & Bonuses

We are targeting the **most complete submission: Level 2 + all bonuses.**

- **Level 1** (baseline): a clean REST conversion API with input validation, error handling, rate
  caching, conversion stats, and tests.
- **Level 2** (our floor): everything in Level 1 **plus** a **persistent database** (stats survive
  restarts and are shared across all clients) **plus** a **Next.js web frontend** following the
  provided Figma "Web layer" design.
- **Bonuses** (in scope): the API is **deployed to a live public URL**, and *all* infrastructure is
  **Infrastructure as Code via SST**.

In short: **API + Next.js frontend + persistent DynamoDB + live AWS deployment + IaC (SST).**

---

## 4. Tech Stack

Committed technology choices and the reasoning behind each:

| Area | Choice | Why |
|------|--------|-----|
| **Language** | **TypeScript** on **Node.js** | One language across API, infra, and frontend; type safety end to end. |
| **API style** | **REST** | Simplest and most universally understood; easiest to test, document, and consume. |
| **Backend / runtime** | **Serverless — AWS Lambda, orchestrated by SST** | Directly satisfies the serverless + IaC bonuses with a cohesive, single-cloud story. |
| **Exchange-rate provider** | **openexchangerates.org** (free plan) | Recommended by the case study; well-documented; USD base with hourly refresh. |
| **Database** | **DynamoDB** | Native to AWS, zero servers to manage, defined directly in SST; the natural fit for Lambda. |
| **Rate caching** | **DynamoDB cache table with TTL (~1h)** | Shared across all Lambda invocations, survives cold starts; TTL tracks the provider's hourly refresh. |
| **Frontend** | **Next.js**, deployed via **SST (OpenNext)** on AWS | Keeps everything in one IaC stack and one cloud; simply consumes the REST API. |
| **Money math** | **A decimal library** (e.g. decimal.js / dinero.js) | Money is never computed with naive floats; values are rounded to each currency's decimal places. |
| **Testing** | **Vitest** — unit + integration | TS-native and fast. Unit tests cover conversion math and cache logic; integration tests cover the handlers with the external provider mocked. |

---

## 5. Architecture at a Glance

```
[Next.js (SST/AWS)] --HTTPS--> [API Gateway] --> [Lambda handlers]
                                                   |
              +------------------------------------+------------------+
              |                                                       |
        rate lookup                                            stats write/read
              |                                                       |
   [DynamoDB rate cache (TTL ~1h)] <-- on miss --> [openexchangerates]   [DynamoDB stats table]
```

Key properties of the design:

- **USD triangulation.** The free provider plan is **USD-base only**, so any pair A→B is computed
  by triangulating through USD: **`result = amount * (rates[to] / rates[from])`**. This supports
  arbitrary source→target pairs from a single USD-based rate table.
- **USD-normalized aggregation.** Every value contributing to the running stats total is
  **normalized to USD** before being added, so the "total sum" is meaningful across mixed
  currencies.
- **Shared, TTL'd rate cache.** A DynamoDB table keyed by base currency holds the latest rates
  with a `fetchedAt` timestamp and a TTL of roughly one hour. Because it lives in DynamoDB, the
  cache is shared across all Lambda invocations and survives cold starts — the cache is a
  first-class, persistent resource, not per-instance memory.
- **Persistent, concurrency-safe stats.** Stats live in DynamoDB and must be **safe to update under
  concurrent Lambda invocations** and **consistent across all clients**. (The exact key design and
  atomic-update mechanism are deferred to the implementation spec; the *requirement* — shared and
  concurrency-safe — is fixed here.)

---

## 6. Core Functionality (user-facing behavior)

Three REST endpoints define the surface (conceptual here — the formal request/response contract
belongs to a later spec):

- **`GET /api/convert?from=&to=&amount=`** → the converted result, the **rate used**, and an
  **`asOf`** timestamp. When the service is serving cached-but-old rates, the response carries a
  **`stale` flag** so the client can warn the user.
- **`GET /api/currencies`** → the list of supported currencies (**code + display name**), sourced
  from the provider's `/currencies` endpoint and **cached** so it always stays in sync with the
  rates we can actually serve.
- **`GET /api/stats`** → the aggregate usage statistics.

**Input validation and meaningful error handling are first-class requirements**, not afterthoughts.
The vision-level behavior the implementation must honor:

- **Unsupported `from`/`to` currency** → validation error (**HTTP 400**) with a meaningful message.
- **`amount` missing, non-numeric, negative, or zero** → validation error (**HTTP 400**); negative
  and zero amounts are rejected.
- **`from == to`** → returns the input amount unchanged with rate **1**; still a valid conversion.
- **Provider unreachable but a valid (within-TTL) cache exists** → serve cached rates, `stale:
  false`.
- **Provider unreachable and cache is expired** → serve the **last-good rates with `stale: true`**
  and an `asOf` timestamp, **HTTP 200** — we favor **availability over freshness**.
- **Provider unreachable and there is no cache at all** (cold start, first-ever call fails) →
  **HTTP 503**: we cannot convert without ever having had rates. Availability is therefore
  *best-effort, bounded by having successfully fetched rates at least once.*
- **Currency-list provider call fails** → serve the cached currency list if available; degrade
  gracefully.
- **Non-2-decimal currencies (e.g. JPY = 0 dp)** → round to **that currency's** decimal places
  using the decimal library; never assume two decimal places universally.
- **Small/large amounts** → all conversion math runs through the decimal library, with rounding
  applied only at the very end, to the target currency's precision.

---

## 7. Conversion Stats

Statistics are **persisted in DynamoDB** so they **survive restarts** and are **shared across all
clients** — this persistence is exactly what separates our Level 2 target from Level 1. We track:

1. **Most frequently used target currency.**
2. **Total sum of all conversions, normalized to USD.**
3. **Total number of conversions.**

These are surfaced in the Next.js frontend; exact placement within the UI is left to the
developer's judgement, as the case study allows.

---

## 8. Repository Structure

A **TypeScript monorepo** keeps pure logic, cloud adapters, frontend, and infrastructure cleanly
separated while sharing types:

```
/packages/core        # pure conversion + cache + stats logic (framework-agnostic, unit-tested)
/packages/functions   # AWS Lambda handlers (thin adapters over core)
/web                  # Next.js frontend (implements the Figma "Web layer")
/sst.config.ts        # Infrastructure as Code: DynamoDB tables, API, Next.js site
/GOAL.md, /README.md  # documentation
```

The intent: business logic in `packages/core` has **no AWS dependencies** and is unit-testable in
isolation; `packages/functions` are thin Lambda adapters; `sst.config.ts` is the single source of
truth for all infrastructure on one cloud.

---

## 9. Definition of Done (incl. non-code deliverables)

The project is **done** when *all* of the following exist — code **and** the case study's required
artifacts:

**Product / code**

- [ ] A working **REST conversion API** on AWS Lambda using **live rates**, with input
      **validation**, **rate caching**, and meaningful **error handling**.
- [ ] **Persistent conversion stats** in DynamoDB that **survive restarts** and are **shared across
      clients**.
- [ ] A **Next.js frontend** following the **Figma "Web layer"** design, consuming the API and
      **displaying the stats**.
- [ ] **Deployed live URL** (bonus) with **all infrastructure as code via SST** (bonus).
- [ ] **Unit + integration tests** in **Vitest** (conversion math and cache logic; handlers with
      the external provider mocked).

**Non-code deliverables (required by the case study)**

- [ ] **README** with clear **local setup instructions**.
- [ ] **AI collaboration diary** — meaningful prompts, including **a win**, **a failure +
      recovery**, and **an override** of the AI.
- [ ] **Future-vision note** — *"If AI writes the code, what does a great engineer do?"*
- [ ] *(Optional)* a **rough time budget**.

---

## 10. Out of Scope

To keep the vision focused, the following are **deliberately excluded** from this project:

- **Multi-provider rate failover** — a single provider (openexchangerates) with stale-cache
  fallback is sufficient; we accept best-effort availability bounded by having fetched rates once.
- **Authentication, authorization, and user accounts** — the service is open and stateless per
  request (aside from shared stats).
- **Historical-rate charts / time-series analytics** — only the three aggregate stats above.
- **Currencies or pairs the provider's free, USD-base plan cannot support.**
- **Detailed implementation contracts** — full request/response schemas, the DynamoDB table/key
  design, the concurrent-stats atomic-update mechanism, the exact cache TTL value, and the
  decimal.js-vs-dinero.js choice are all intentionally **deferred to a later implementation spec**.
  This document fixes the *requirements and direction*, not the mechanisms.
