## 1. Keep this file updated (do this first, every time)

**Before finishing any task, update this CLAUDE.md.** It is the project's living memory. The repo
is early-stage (toolchain in, app code pending), so much of what follows describes _intended_
structure — as real code lands, this file drifts from reality unless you maintain it. On every change that affects how the codebase is
built, run, tested, or structured:

- Replace "intended / planned" notes with the real commands once `package.json` / `sst.config.ts` exist.
- Record new invariants, gotchas, and decisions resolved from the deferred list (see §7).
- Keep it lean — high-signal architecture and rules only, not a file listing. Delete what's stale.

## 2. Project status

**Toolchain in, app code not yet.** The repo is git-initialized with the full quality gate wired
(see §8). `GOAL.md` (north-star vision) and `specs/` define intent. No app code exists yet —
`packages/`, `web/`, and `sst.config.ts` are still to come. `GOAL.md` is the authoritative source of
intent; when it and code disagree, treat it as drift and reconcile (usually update this file + the
code, not the vision).

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
   commit it, never ship it to the frontend bundle. The browser talks to _our_ API, not the provider.

> Threat model + control checklist: [`docs/security.md`](docs/security.md).

## 6. Core behavior & edge cases (authoritative — `GOAL.md` §6, spec Edge Cases table)

Three REST endpoints: `GET /api/convert?from=&to=&amount=`, `GET /api/currencies`, `GET /api/stats`.

| Scenario                                         | Required behavior                                            |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `from`/`to` not a supported currency             | **400** with a meaningful message                            |
| `amount` missing / non-numeric / negative / zero | **400** (negative and zero are rejected)                     |
| `from == to`                                     | Return amount unchanged, rate `1` — still a valid conversion |
| Provider down, **cache within TTL**              | Serve cached rates, `stale: false`                           |
| Provider down, **cache expired**                 | Serve last-good rates, `stale: true` + `asOf`, **HTTP 200**  |
| Provider down, **no cache at all**               | **503** — cannot convert without ever having had rates       |
| Currency-list provider call fails                | Serve cached currency list if available; degrade gracefully  |
| Non-2-dp currency (e.g. JPY)                     | Round to that currency's dp via the decimal library          |

`/convert` responses carry the converted amount, the **rate used**, an **`asOf`** timestamp, and a
**`stale`** flag.

## 7. Stats tracked

Persisted in DynamoDB (survive restarts, shared across clients — this is what makes it Level 2):
most frequently used **target** currency, **total sum** of all conversions normalized to **USD**,
and **total count** of conversions. Surfaced in the Next.js UI.

## 8. Commands & tooling

Monorepo managed with **pnpm workspaces** (`pnpm-workspace.yaml`), **Node 22** (`.nvmrc`), pinned via
the `packageManager` field. Run from the repo root:

| Command                             | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm install`                      | Install workspace deps (sets up Husky via `prepare`) |
| `pnpm format` / `pnpm format:check` | Prettier write / check                               |
| `pnpm lint` / `pnpm lint:fix`       | ESLint (flat config, `eslint.config.js`)             |
| `pnpm typecheck`                    | `tsc -b` across project references                   |
| `pnpm test` / `pnpm test:watch`     | Vitest (`--passWithNoTests` until tests land)        |

- **Tests:** Vitest — unit (conversion math, cache logic) + integration (handlers with the provider
  mocked). Never call the live API from a test.
- **Local dev / deploy:** SST (`sst dev`, `sst deploy`) — _added when `sst.config.ts` lands._
- **Frontend:** Next.js via SST (OpenNext) — _added with `web/`._

TypeScript uses **project references**: `tsconfig.base.json` holds the strict options (incl.
`noUncheckedIndexedAccess`); each package extends it and is added to the root `tsconfig.json`
`references` so `tsc -b` and the editor resolve the whole graph.

### Repository workflow & tooling

- **Branch model (solo):** Commit **directly to `main`** — no branches, PRs, or worktrees. This is a
  single-developer project, so it deliberately overrides the global worktree rules for _this_ repo.
  A `PreToolUse` guardrail (`.claude/hooks/guard-git-workflow.sh`) keeps the agent honest by blocking
  `git --no-verify`, so the local quality gate can't be silently skipped (wired in
  `.claude/settings.json`, kept local by the global gitignore — copy `.claude/settings.json.example`
  to re-enable in a fresh clone).
- **Quality-gate ladder (wired):** **pre-commit** (Husky + lint-staged) runs Prettier + ESLint on
  **staged files only**; **commit-msg** enforces Conventional Commits (commitlint); **pre-push** runs
  `pnpm typecheck`; **CI** (`.github/workflows/ci.yml`) re-runs the full lint + typecheck + test
  (+ build once packages emit) on every push to `main`, as a clean-environment backstop. Prettier
  formats, ESLint checks correctness (`eslint-config-prettier` keeps them
  separate). ESLint also enforces two invariants as errors: **`packages/core` may not import
  AWS/framework code** (§4) and **no `parseFloat` on money** (§5.1, heuristic).
- **Secrets:** `.github/workflows/secret-scan.yml` (gitleaks) runs on every push to `main`. The
  provider App ID lives only in `.env` (gitignored) or an SST Secret — see §5.6.
- **Docs travel with code (anti-drift):** update the affected doc layer in the **same commit** as the
  change. Layers: this file + nested
  per-package `CLAUDE.md` (agents) · `README.md` (setup) · `docs/adr/` (decisions — one ADR per
  resolved §9 item) · `docs/security.md` (threat model) · generated OpenAPI (API contract) ·
  CHANGELOG via Conventional Commits.

### Up-to-date library docs (Context7)

Before writing or debugging against a fast-moving dependency, pull current docs via the **Context7**
MCP — training data lags these. Especially **SST v3 (Ion)** (infra API differs a lot from v2),
**AWS SDK for JS v3** (DynamoDB client/commands), **Next.js App Router**, **Zod**, and the chosen
decimal library. Prefer Context7 over assuming an API.

## 9. Deferred decisions (resolve in an implementation spec, then record here)

Intentionally open in `GOAL.md`: exact DynamoDB table/key design + atomic-counter mechanism; whether
`from == to` counts toward stats; formal request/response + error-body schemas; exact cache TTL;
decimal.js vs dinero.js. Don't invent these silently — decide them in a spec under `specs/` and then
document the outcome here.

## 10. Out of scope

No multi-provider failover, no auth/accounts, no historical-rate charts, no currencies the free
USD-base plan can't support. Don't build these.
