## 1. Keep this file updated (do this first, every time)

**Before finishing any task, update this CLAUDE.md.** It is the project's living memory. On every
change that affects how the codebase is built, run, tested, or structured:

- Record new invariants, gotchas, and decisions resolved from the deferred list (see §9).
- Keep it lean — high-signal architecture and rules only, not a file listing. Delete what's stale.

## 2. Project status

**Full stack shipped.** The repo contains the complete implementation:

- `packages/core` — pure conversion, validation, cache-policy, and stats logic (no AWS deps)
- `packages/functions` — thin Lambda handlers for `/api/convert`, `/api/currencies`, `/api/stats`
- `web/` — Next.js App Router frontend (convert form, result card with stale badge, stats panel)
- `sst.config.ts` — IaC: 2 DynamoDB tables (RateCache + Stats), API Gateway, Next.js site, App ID Secret

`GOAL.md` is the authoritative vision; `specs/applied/spec--2026-06-17--14-17-...md` is the
authoritative mechanism. When code and docs disagree, reconcile (usually update docs + code).

## 3. What this is

A **serverless currency converter** (Purple LAB "Backend Developer 2026" case study), targeting
**Level 2 + all bonuses**: REST API + Next.js frontend + persistent DynamoDB + live AWS deployment,
all as Infrastructure-as-Code via SST. It handles money, so **correctness and validation are
first-class, not polish.**

## 4. Architecture

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
- **Two DynamoDB tables:** a rate **cache** (keyed by base currency, `fetchedAt` + TTL 3600s,
  shared across all Lambda invocations and surviving cold starts) and a **stats** table with a
  single `STATS#GLOBAL` aggregate item updated atomically.

## 5. Non-negotiable invariants (fintech correctness & security)

These are the rules that make this a money app rather than a toy. Violating any of them is a bug.

1. **Never compute money with native floats.** All conversion math goes through **decimal.js** with
   `ROUND_HALF_EVEN` (banker's rounding). Round **only at the very end**, to the **target
   currency's** decimal places (USD=2, **JPY=0** — never hardcode 2 dp). See `CURRENCY_DP` table
   in `packages/core/src/money.ts`.
2. **Input validation + meaningful errors are mandatory** at the API boundary (see §6 table). Bad
   input returns a clear 4xx with a message, never a stack trace, a wrong number, or a 500.
   Validated by **Zod** in `packages/core/src/validate.ts`; mapped to `AppError` — raw ZodErrors
   never escape the core layer.
3. **Rate caching — never hit the exchange-rate provider on every request.** Read from the shared
   DynamoDB cache first; only fetch from openexchangerates on a miss/expiry, then write back. The
   cache is a first-class persistent resource, not per-instance memory.
4. **Availability over freshness.** If the provider is down but a cache exists, serve it (stale-cache
   fallback with a `stale` flag + `asOf`). Only fail (503) when there is no cache at all.
5. **Stats writes must be concurrency-safe.** Multiple Lambdas update stats simultaneously — use a
   single atomic DynamoDB `UpdateItem` with `ADD` on `STATS#GLOBAL` (per-currency frequency as flat
   `tc_<CUR>` counters — never a nested map path, which fails on first write), never read-modify-write.
6. **The openexchangerates App ID is a secret.** It comes from an SST Secret / env var — never
   commit it, never ship it to the frontend bundle. The browser talks to _our_ API, not the provider.

> Threat model + control checklist: [`docs/security.md`](docs/security.md).

## 6. Core behavior & edge cases (authoritative — spec Edge Cases table)

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
most frequently used **target** currency (tie → lexicographically smallest code), **total sum** of
all conversions normalized to **USD**, and **total count** of conversions. `from == to` conversions
count toward stats (Decision #3). Surfaced in the Next.js UI via `StatsPanel`.

## 8. Commands & tooling

Monorepo managed with **pnpm workspaces** (`pnpm-workspace.yaml`), **Node 22** (`.nvmrc`), pinned via
the `packageManager` field. Run from the repo root:

| Command                                      | What it does                                            |
| -------------------------------------------- | ------------------------------------------------------- |
| `pnpm install`                               | Install workspace deps (sets up Husky via `prepare`)    |
| `pnpm format` / `pnpm format:check`          | Prettier write / check                                  |
| `pnpm lint` / `pnpm lint:fix`                | ESLint (flat config, `eslint.config.js`)                |
| `pnpm typecheck`                             | `tsc -b` across project references                      |
| `pnpm test` / `pnpm test:watch`              | Vitest (unit + integration, core + functions)           |
| `pnpm --filter @currency/web build`          | Next.js production build                                |
| `sst dev`                                    | Local dev stack (live-reload, proxied API)              |
| `sst deploy`                                 | Deploy to AWS (requires credentials + secret set below) |
| `sst secret set OpenExchangeRatesAppId <id>` | Set the App ID secret (required before deploy)          |

- **Tests:** Vitest — unit (`packages/core/test/`) + integration (`packages/functions/test/`). The
  provider and DynamoDB are `vi.mock`-ed; tests never call the live API or AWS.
- **Local dev:** `sst dev` starts a local proxy and runs the Next.js dev server.
- **Deploy:** `sst deploy` after `sst secret set OpenExchangeRatesAppId <your-id>`.

TypeScript uses **project references**: `tsconfig.base.json` holds the strict options (incl.
`noUncheckedIndexedAccess`); `packages/core` and `packages/functions` are in `tsconfig.json`
`references`. `web/` is not in root references — `next build` owns its typecheck.

### Repository workflow & tooling

- **Branch model (solo):** Commit **directly to `main`** — no branches, PRs, or worktrees.
  A `PreToolUse` guardrail (`.claude/hooks/guard-git-workflow.sh`) keeps the agent honest by blocking
  `git --no-verify`, so the local quality gate can't be silently skipped.
- **Quality-gate ladder (wired):** **pre-commit** (Husky + lint-staged) runs Prettier + ESLint on
  **staged files only**; **commit-msg** enforces Conventional Commits (commitlint); **pre-push** runs
  `pnpm typecheck`; **CI** (`.github/workflows/ci.yml`) re-runs the full lint + typecheck + test +
  build + audit on every push to `main`. ESLint enforces two invariants as errors: **`packages/core`
  may not import AWS/framework code** (§4) and **no `parseFloat` on money** (§5.1, heuristic).
- **Secrets:** `.github/workflows/secret-scan.yml` (gitleaks) runs on every push to `main`. The
  provider App ID lives only in `.env` (gitignored) or an SST Secret — see §5.6.
- **Docs travel with code (anti-drift):** update the affected doc layer in the **same commit** as the
  change. Layers: this file + nested per-package `CLAUDE.md` (agents) · `README.md` (setup) ·
  `docs/adr/` (decisions — one ADR per resolved §9 item) · `docs/security.md` (threat model).

### Up-to-date library docs (Context7)

Before writing or debugging against a fast-moving dependency, pull current docs via the **Context7**
MCP — training data lags these. Especially **SST v4** (Ion-family; `$config`/`sst.aws.*`/`link`,
infra API differs a lot from v2), **AWS SDK for JS v3** (DynamoDB client/commands), **Next.js App
Router**, **Zod**, and **decimal.js**. Prefer Context7 over assuming an API.

### Deployment & CI/CD

Live deploy is `pnpm sst deploy --stage production`. **Production CI/CD runs from GitHub Actions via
AWS OIDC — no static AWS keys are ever stored in GitHub** (`.github/workflows/deploy.yml` assumes a
repo-scoped IAM role with a short-lived token after `ci` passes on `main`). The openexchangerates App
ID lives only in AWS SSM via `sst secret set` — never in the repo or GitHub. Full runbook + the
one-time OIDC bootstrap (`infra/aws/bootstrap-github-oidc.sh`): [`infra/aws/README.md`](infra/aws/README.md).
The long-lived `sst-deploy` IAM user is for **manual/local** deploys only; CI uses the keyless role.

## 9. Resolved decisions (formerly "Deferred")

All five deferred items from the original `CLAUDE.md` §9 are resolved. See ADR-0002–0009 in
`docs/adr/`.

| Decision                                     | Outcome                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| decimal.js vs dinero.js                      | **decimal.js** with `ROUND_HALF_EVEN` (ADR-0002)                                                         |
| Exact cache TTL                              | Rate cache: **3600s (1h)**; currency list: **86400s (24h)** (ADR-0003)                                   |
| `from == to` toward stats?                   | **Yes — counts** (ADR-0004)                                                                              |
| DynamoDB table/key + atomic mechanism        | Single `STATS#GLOBAL` item, `ADD` on flat `tc_<CUR>` counters (ADR-0005)                                 |
| Formal request/response + error-body schemas | Typed JSON envelope `{error:{code,message,details?}}`; numeric fields as strings (ADR-0006)              |
| Build scope                                  | Full stack in one pass (ADR-0007)                                                                        |
| Production hardening                         | Structured+redacted logging, API throttling, CORS allowlist, security headers, least-priv IAM (ADR-0008) |
| Product boundary                             | Currency conversion only — no securities/asset trading (ADR-0009)                                        |

## 10. Out of scope

No multi-provider failover, no auth/accounts, no historical-rate charts, no currencies the free
USD-base plan can't support. Don't build these.
