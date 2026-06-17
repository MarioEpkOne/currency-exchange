# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Keep this file updated (do this first, every time)

**Before finishing any task, update this CLAUDE.md.** It is the project's living memory. The repo
is greenfield, so most of what follows describes *intended* structure — as real code lands, this
file drifts from reality unless you maintain it. On every change that affects how the codebase is
built, run, tested, or structured:

- Replace "intended / planned" notes with the real commands once `package.json` / `sst.config.ts` exist.
- Record new invariants, gotchas, and decisions resolved from the deferred list (see §7).
- Keep it lean — high-signal architecture and rules only, not a file listing. Delete what's stale.

## 2. Project status

**Greenfield.** Only `GOAL.md` (north-star vision) and `specs/` exist. No source, no `package.json`,
no git repo yet. `GOAL.md` is the authoritative source of intent; `specs/` holds detailed,
interview-driven specs. When `GOAL.md` and code disagree, treat it as drift and reconcile (usually
update this file + the code, not the vision).

## 3. What this is

A **serverless currency converter** (Purple LAB "Backend Developer 2026" case study), targeting
**Level 2 + all bonuses**: REST API + Next.js frontend + persistent DynamoDB + live AWS deployment,
all as Infrastructure-as-Code via SST. It handles money, so **correctness and validation are
first-class, not polish.**

## 4. Architecture (intended — see `GOAL.md` §5, §8)

Monorepo with a hard dependency rule:

```
/packages/core        # pure conversion + cache + stats logic — NO AWS imports, fully unit-tested
/packages/functions   # thin AWS Lambda handlers — adapters only, business logic stays in core
/web                  # Next.js frontend (Figma "Web layer"), consumes the REST API
/sst.config.ts        # single source of truth for ALL infra (DynamoDB tables, API, site)
```

- **`packages/core` must never import AWS SDKs or framework code.** It is testable in isolation;
  functions are thin adapters over it. This boundary is the whole point of the structure.
- **USD triangulation.** The provider's free plan is USD-base only. Compute any pair as
  `result = amount * (rates[to] / rates[from])`. Don't assume a non-USD base.
- **USD-normalized stats.** Every conversion's value is normalized to USD before being added to the
  running total, so the aggregate sum is meaningful across mixed currencies.
- **Two DynamoDB tables:** a rate **cache** (keyed by base currency, `fetchedAt` + TTL ~1h, shared
  across all Lambda invocations and surviving cold starts) and a **stats** table.

## 5. Non-negotiable invariants (fintech correctness & security)

These are the rules that make this a money app rather than a toy. Violating any of them is a bug.

1. **Never compute money with native floats.** All conversion math goes through the decimal library
   (decimal.js / dinero.js — choice deferred, see §7). Round **only at the very end**, to the
   **target currency's** decimal places (USD=2, **JPY=0** — never hardcode 2 dp).
2. **Input validation + meaningful errors are mandatory** at the API boundary (see §6 table). Bad
   input returns a clear 4xx with a message, never a stack trace, a wrong number, or a 500.
3. **Rate caching — never hit the exchange-rate provider on every request.** Read from the shared
   DynamoDB cache first; only fetch from openexchangerates on a miss/expiry, then write back. The
   cache is a first-class persistent resource, not per-instance memory.
4. **Availability over freshness.** If the provider is down but a cache exists, serve it (stale-cache
   fallback with a `stale` flag + `asOf`). Only fail (503) when there is no cache at all.
5. **Stats writes must be concurrency-safe.** Multiple Lambdas update stats simultaneously — use
   atomic DynamoDB updates (e.g. `ADD`), never read-modify-write.
6. **The openexchangerates App ID is a secret.** It comes from an SST Secret / env var — never
   commit it, never ship it to the frontend bundle. The browser talks to *our* API, not the provider.

## 6. Core behavior & edge cases (authoritative — `GOAL.md` §6, spec Edge Cases table)

Three REST endpoints: `GET /api/convert?from=&to=&amount=`, `GET /api/currencies`, `GET /api/stats`.

| Scenario | Required behavior |
|----------|-------------------|
| `from`/`to` not a supported currency | **400** with a meaningful message |
| `amount` missing / non-numeric / negative / zero | **400** (negative and zero are rejected) |
| `from == to` | Return amount unchanged, rate `1` — still a valid conversion |
| Provider down, **cache within TTL** | Serve cached rates, `stale: false` |
| Provider down, **cache expired** | Serve last-good rates, `stale: true` + `asOf`, **HTTP 200** |
| Provider down, **no cache at all** | **503** — cannot convert without ever having had rates |
| Currency-list provider call fails | Serve cached currency list if available; degrade gracefully |
| Non-2-dp currency (e.g. JPY) | Round to that currency's dp via the decimal library |

`/convert` responses carry the converted amount, the **rate used**, an **`asOf`** timestamp, and a
**`stale`** flag.

## 7. Stats tracked

Persisted in DynamoDB (survive restarts, shared across clients — this is what makes it Level 2):
most frequently used **target** currency, **total sum** of all conversions normalized to **USD**,
and **total count** of conversions. Surfaced in the Next.js UI.

## 8. Commands (planned — fill in once scaffolded)

No build tooling exists yet. The committed stack (`GOAL.md` §4) implies:

- **Tests:** Vitest — unit (conversion math, cache logic) + integration (handlers with the provider
  mocked). External provider must be mocked in tests; never call the live API from a test.
- **Local dev / deploy:** SST (`sst dev`, `sst deploy`).
- **Frontend:** Next.js, deployed via SST (OpenNext).

Package manager and exact scripts are TBD — **update this section with the real commands the moment
`package.json` lands.**

## 9. Deferred decisions (resolve in an implementation spec, then record here)

Intentionally open in `GOAL.md`: exact DynamoDB table/key design + atomic-counter mechanism; whether
`from == to` counts toward stats; formal request/response + error-body schemas; exact cache TTL;
decimal.js vs dinero.js. Don't invent these silently — decide them in a spec under `specs/` and then
document the outcome here.

## 10. Out of scope

No multi-provider failover, no auth/accounts, no historical-rate charts, no currencies the free
USD-base plan can't support. Don't build these.
