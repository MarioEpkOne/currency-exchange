# Currency Exchange

A deployed, serverless currency converter: enter an amount and a source currency, pick a target
currency, and get an accurate result backed by **live exchange rates** — plus usage statistics that
persist across sessions and clients. Built for the Purple LAB "Backend Developer 2026" case study.

> **Status: greenfield / scaffolding.** The vision is committed in [`GOAL.md`](./GOAL.md); the code
> (API, frontend, infra) is not built yet. Sections marked _TODO_ get filled in as the monorepo lands.

## Documentation map

| Audience                  | Doc                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| **Agents** (Claude, etc.) | [`CLAUDE.md`](./CLAUDE.md) — architecture, invariants, commands               |
| **Humans — vision**       | [`GOAL.md`](./GOAL.md) — north-star / definition of done                      |
| **Humans — decisions**    | [`docs/adr/`](./docs/adr) — Architecture Decision Records                     |
| **API contract**          | _TODO_: OpenAPI at `/api/openapi.json`, generated from the validation schemas |
| **Security**              | [`docs/security.md`](./docs/security.md) — threat model & control checklist   |

## Architecture (summary)

A TypeScript monorepo on AWS, with all infrastructure as code via SST. Full detail in
[`CLAUDE.md`](./CLAUDE.md) §4 and [`GOAL.md`](./GOAL.md) §5.

```
/packages/core        # pure conversion + cache + stats logic (no AWS deps)
/packages/functions   # AWS Lambda handlers (thin adapters)
/web                  # Next.js frontend
/sst.config.ts        # infra: DynamoDB tables, API, site
```

## Prerequisites

- **Node 22** (see `.nvmrc`) and **pnpm** (pinned via `packageManager`; `corepack enable` provides it)
- An [openexchangerates.org](https://openexchangerates.org/signup/free) App ID (free plan)
- AWS credentials configured locally (for `sst dev` / deploy, once infra lands)

## Local setup

1. Copy the env template and fill in your provider App ID:
   ```bash
   cp .env.example .env
   # then edit .env and set OPENEXCHANGERATES_APP_ID
   ```
   The App ID is a **secret** — it stays in `.env` (gitignored) or an SST Secret, and is **never**
   shipped to the browser. The frontend talks only to our API, never to the provider directly.
2. Install dependencies: `pnpm install` (also sets up the Git hooks via Husky).
3. Run the dev stack — _TODO_ (`sst dev`, once `sst.config.ts` lands).

## Commands

Run from the repo root:

```bash
pnpm format         # Prettier write       pnpm format:check  # Prettier check (CI)
pnpm lint           # ESLint               pnpm lint:fix      # ESLint autofix
pnpm typecheck      # tsc -b               pnpm test          # Vitest
```

The quality gate runs automatically: **pre-commit** (Prettier + ESLint on staged files),
**commit-msg** (Conventional Commits), **pre-push** (typecheck), and **CI** (the full suite). See
[`CLAUDE.md`](./CLAUDE.md) §8.

## Deployment

_TODO — `sst deploy` produces a live public URL (bonus). All infra is defined in `sst.config.ts`._

## Testing

_TODO_ — Vitest: unit (conversion math, cache logic) + integration (handlers with the provider
**mocked**). Tests never call the live API.

## Case-study deliverables

- [x] README with local setup (this file — _expand as code lands_)
- [ ] AI collaboration diary (`docs/ai-diary.md`) — a win, a failure + recovery, an override
- [ ] Future-vision note — "If AI writes the code, what does a great engineer do?"
- [ ] _(optional)_ rough time budget
