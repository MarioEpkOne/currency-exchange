# Spec: GOAL.md for the Currency Exchange Application

**Status:** Ready to implement (no open questions)
**Author:** Clarifier Agent (interview-driven)
**Date:** 2026-06-16
**Deliverable of this spec:** A single `GOAL.md` file at the repository root.

---

## Goal

Produce a `GOAL.md` file that captures the **high-level end-state vision** of a currency
exchange application built for the Purple LAB "Backend Developer 2026" case study. The file
must describe **what the finished product looks like** in terms of:

- **Functionality** — what the app does for a user, end to end.
- **Tech stack** — the committed technology choices and why.
- **Definition of done** — including the non-code deliverables the case study requires.

`GOAL.md` is a north-star / vision document, **not** an implementation plan. It tells any
developer (human or AI) where we are headed so that downstream planning and coding stay aligned.
It is the artifact the case study explicitly rewards committing before coding ("Commit your plan
or spec... We love seeing how you think about a problem before you solve it").

This spec defines exactly what content `GOAL.md` must contain. Writing `GOAL.md` is the only
output of the implementation step that follows.

---

## Current State

- The project directory `/mnt/c/Users/Epkone/CurrencyExchange` is **completely empty** — greenfield.
- No git repository, no code, no config, no existing docs.
- Source of requirements: `Backend_Developer_2026_case_study_final.pdf` (read in full). Summary:
  - Build a **currency conversion API**, optionally a web frontend.
  - User enters an amount + source currency, picks a target currency, gets the converted result.
  - **Level 1:** API only — clean endpoints, input validation, error handling, rate caching,
    conversion stats (in-memory or local DB), basic tests.
  - **Level 2:** Level 1 + persistent DB (stats survive restarts, shared across clients) +
    web frontend (React/Next.js) following the provided Figma "Web layer" design.
  - **Bonuses:** deploy the API (live URL) + Infrastructure as Code (SST / Serverless / CDK).
  - **Stats to display:** most frequently used target currency, total sum of all conversions
    (USD or chosen currency), total number of conversions.
  - **Non-code deliverables:** AI collaboration diary, future-vision note, README with local
    setup instructions, optional rough time budget.

---

## Decisions

Every decision below was confirmed by the user during the interview and must be reflected in
`GOAL.md`.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **Target scope** | **Level 2 + bonuses** | Most complete submission: API + frontend + persistent DB + live deployment + IaC. |
| 2 | **API style** | **REST** | Simplest, universally understood, easiest to test and document. Endpoints: `/api/convert`, `/api/stats`, `/api/currencies`. |
| 3 | **Backend framework / runtime** | **Serverless — AWS Lambda + SST** | Directly satisfies the serverless + IaC bonuses; cohesive single-cloud story. |
| 4 | **Exchange-rate provider** | **openexchangerates.org** (free plan) | Recommended in the case study; USD base, hourly refresh, well documented. |
| 5 | **Database** | **DynamoDB** | Native AWS, zero-server, defined directly in SST. Best fit for Lambda. |
| 6 | **Rate caching** | **DynamoDB cache table with TTL** | Shared across all Lambda invocations, survives cold starts; TTL ~1h matching free-plan refresh. |
| 7 | **Frontend** | **Next.js, deployed via SST (OpenNext) on AWS** | One IaC stack, one cloud; consumes the REST API. |
| 8 | **Cross-rate computation** | **USD triangulation** | Free plan is USD-base only. `result = amount * (rates[to] / rates[from])` supports any A→B pair. |
| 9 | **Stats normalization currency** | **USD** | Matches provider base; cleanest, most accurate aggregation for "total sum". |
| 10 | **Currency list source** | **Provider `/currencies` endpoint** (cached) | Code + display name, always in sync with available rates. |
| 11 | **Testing** | **Vitest — unit + integration** | TS-native, fast. Unit: conversion math, cache logic. Integration: handlers with external provider mocked. |
| 12 | **Money precision** | **Decimal library (decimal.js/dinero.js), round to currency dp** | Avoids float errors; round to target currency's decimal places (USD=2, JPY=0). |
| 13 | **Provider-failure behavior** | **Serve stale cache + `stale: true` flag** | Availability over freshness; returns last-good rates with `asOf` timestamp so the client can warn. |
| 14 | **Repo structure** | **Monorepo (packages)** | `packages/core` (logic), `packages/functions` (Lambda), `web` (Next.js), shared TS types, `sst.config.ts` at root. |
| 15 | **GOAL.md scope** | **Include all deliverables** | GOAL.md's definition of done covers app + AI diary + future-vision note + README + time budget. |

---

## Technical Design

The implementation step writes **one file: `GOAL.md` at the repo root**. Below is the required
section structure and the content each section must convey. Prose may be polished, but every
decision in the table above must appear.

> Code/structure sketches below are **illustrative**. Where any sketch conflicts with the
> **Edge Cases & Error Handling** table, the Edge Cases table wins.

### Required `GOAL.md` structure

```
# Currency Exchange — Project Goal

1. Vision (one paragraph)
2. What We're Building (functional scope)
3. Target Level & Bonuses
4. Tech Stack
5. Architecture at a Glance
6. Core Functionality (user-facing behavior)
7. Conversion Stats
8. Repository Structure
9. Definition of Done (incl. non-code deliverables)
10. Out of Scope
```

### Section content requirements

**1. Vision** — One paragraph: a deployed, serverless currency converter where a user enters an
amount + source currency, selects a target currency, and instantly receives an accurate converted
result backed by live exchange rates, with usage statistics that persist across sessions and
clients.

**2. What We're Building** — Narrate the end-to-end flow: user input → API converts using cached
live rates → result returned & displayed → conversion recorded → stats updated and shown.

**3. Target Level & Bonuses** — State explicitly: **Level 2 + bonuses** (API + Next.js frontend +
persistent DynamoDB + live AWS deployment + IaC via SST).

**4. Tech Stack** — A clear list:
- Language: **TypeScript** (Node.js).
- API: **REST** on **AWS Lambda**, orchestrated by **SST** (IaC).
- Data source: **openexchangerates.org** (free plan, USD base).
- Database: **DynamoDB** (stats + a TTL-based rate cache table).
- Frontend: **Next.js**, deployed via SST (OpenNext) on AWS.
- Money math: **decimal library** (decimal.js / dinero.js).
- Testing: **Vitest** (unit + integration, external provider mocked).

**5. Architecture at a Glance** — Describe the request path and the caching/persistence model:

```
[Next.js (SST/AWS)] --HTTPS--> [API Gateway] --> [Lambda handlers]
                                                   |
              +------------------------------------+------------------+
              |                                                       |
        rate lookup                                            stats write/read
              |                                                       |
   [DynamoDB rate cache (TTL ~1h)] <-- on miss --> [openexchangerates]   [DynamoDB stats table]
```

- Conversions computed via **USD triangulation**: `result = amount * (rates[to] / rates[from])`.
- All monetary values aggregated for stats are **normalized to USD**.
- Rate cache: DynamoDB table keyed by base currency, with `fetchedAt` + TTL; shared across
  Lambda invocations.

**6. Core Functionality** — Document the three REST endpoints conceptually (not as a formal API
contract — that belongs to a later spec):
- `GET /api/convert?from=&to=&amount=` → converted result, the rate used, and an `asOf`
  timestamp (plus a `stale` flag when serving cached-but-old rates).
- `GET /api/currencies` → list of supported currencies (code + name) from the provider, cached.
- `GET /api/stats` → the aggregate statistics.
- Note input validation and meaningful error handling as first-class requirements.

**7. Conversion Stats** — Persisted in DynamoDB, surviving restarts and shared across clients:
- Most frequently used **target** currency.
- **Total sum** of all conversions, normalized to **USD**.
- **Total number** of conversions.
- Displayed in the frontend (placement at developer's judgement, per the case study).

**8. Repository Structure** — Present the monorepo layout:

```
/packages/core        # pure conversion + cache + stats logic (framework-agnostic, unit-tested)
/packages/functions   # AWS Lambda handlers (thin adapters over core)
/web                  # Next.js frontend (Figma "Web layer")
/sst.config.ts        # Infrastructure as Code (DynamoDB tables, API, Next.js site)
/GOAL.md, /README.md  # docs
```

**9. Definition of Done** — Must enumerate all deliverables (Decision #15):
- Working REST conversion API on AWS Lambda with live rates, validation, caching, error handling.
- Persistent conversion stats in DynamoDB (survive restarts, shared across clients).
- Next.js frontend following the Figma design, consuming the API, showing stats.
- Deployed live URL (bonus) + IaC via SST (bonus).
- Unit + integration tests (Vitest).
- **README** with local setup instructions.
- **AI collaboration diary** (meaningful prompts: a win, a failure + recovery, an override).
- **Future-vision note** ("If AI writes the code, what does a great engineer do?").
- Optional **rough time budget**.

**10. Out of Scope** — See "Constraints & Invariants" and the out-of-scope list below; GOAL.md
should briefly state what it deliberately excludes (e.g. multi-provider failover, auth, user
accounts, historical-rate charts).

---

## Edge Cases & Error Handling

This table is the **authoritative** source of behavior that `GOAL.md` must reflect (at a vision
level) and that downstream implementation specs must honor. Where a Technical Design sketch
conflicts with a row here, **this table wins**.

| Scenario | Required behavior |
|----------|-------------------|
| Provider unreachable / rate-limited, **valid cache exists** | Serve cached rates; response includes `stale: false` if within TTL. |
| Provider unreachable / rate-limited, **cache expired (stale)** | Serve last-good cached rates with `stale: true` + `asOf` timestamp; HTTP 200. Availability over freshness. |
| Provider unreachable / rate-limited, **no cache at all** (cold start, first ever call fails) | Return an error (HTTP 503) — cannot convert without any rates. GOAL.md notes availability is best-effort, bounded by ever having fetched rates once. |
| `from` or `to` is not a supported currency code | Validation error (HTTP 400) with a meaningful message. |
| `amount` missing, non-numeric, negative, or zero | Validation error (HTTP 400). Negative/zero amounts rejected. |
| `from == to` | Return the input amount unchanged with rate `1`; still a valid conversion (counts toward stats per implementer's later decision — flag as a detail for the implementation spec). |
| Conversion of a currency with non-2 decimal places (e.g. JPY=0) | Round to that currency's decimal places using the decimal library; never assume 2 dp universally. |
| Float precision on small/large amounts | All conversion math uses the decimal library, not native floats; result rounded only at the end to target-currency dp. |
| Cross-rate where `from != USD` | Compute via USD triangulation: `amount * (rates[to] / rates[from])`. |
| Stats sum across mixed currencies | Each conversion's value normalized to **USD** before adding to the running total. |
| Concurrent Lambda invocations updating stats | Stats writes must be safe under concurrency (e.g. DynamoDB atomic counters / `ADD`) — GOAL.md notes "shared across clients" as a hard requirement; mechanism deferred to implementation spec. |
| Currency list provider call fails | Serve cached currency list if available; degrade gracefully. |

> Note: rows that say "deferred to implementation spec" are intentional — `GOAL.md` is a vision
> document and should state the *requirement* (e.g. concurrency-safe, availability-first) without
> prescribing the mechanism.

---

## Constraints & Invariants

- **`GOAL.md` is vision-level**, not an implementation plan or API contract. It must stay readable
  by a non-implementer and avoid over-specifying (no full request/response schemas, no DynamoDB
  key designs — those belong to later specs).
- **TypeScript + Node.js** throughout.
- **Single cloud (AWS), single IaC tool (SST)** — keep the deployment story cohesive.
- **Free-plan constraint:** openexchangerates free plan is **USD-base only** and refreshes hourly;
  caching TTL and triangulation exist precisely because of this.
- **Stats must persist** (DynamoDB) and be **consistent across clients** — this is what separates
  Level 2 from Level 1.
- **Money is never computed with naive floats.**
- The implementation step must produce **only `GOAL.md`** — no code, no config, no other files.

---

## Testing Strategy

Because the deliverable is a documentation file, "testing" is a content-completeness review rather
than automated tests. `GOAL.md` is correct when:

- [ ] All 10 required sections are present and in order.
- [ ] Every decision in the Decisions table (#1–#15) is represented.
- [ ] Target scope is unambiguously stated as **Level 2 + bonuses**.
- [ ] Tech stack lists: TypeScript, REST, AWS Lambda + SST, openexchangerates, DynamoDB (stats +
      TTL cache), Next.js, decimal library, Vitest.
- [ ] The USD-triangulation approach and USD-normalized stats are explained.
- [ ] The three stats (top target currency, total USD sum, total count) are listed.
- [ ] The monorepo structure is shown.
- [ ] Definition of Done includes the non-code deliverables (README, AI diary, future-vision note,
      time budget).
- [ ] Stale-cache / availability-first behavior is mentioned at vision level.
- [ ] An "Out of Scope" section exists.
- [ ] The document reads as a vision/north-star, not as a step-by-step build plan.

---

## Open Questions

**None.** All blocking ambiguities were resolved during the interview.

Non-blocking items deliberately deferred to a **later implementation spec** (not needed to write
`GOAL.md`):
- Exact DynamoDB table/key design and the atomic-counter mechanism for concurrent stats writes.
- Whether `from == to` conversions count toward stats.
- Formal REST request/response schemas and error-body shape.
- Cache TTL exact value (will track the provider's hourly refresh).
- Choice between decimal.js vs dinero.js.
