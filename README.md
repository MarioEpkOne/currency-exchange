# Currency Exchange

A deployed, serverless currency converter: enter an amount and a source currency, pick a target
currency, and get an accurate result backed by **live exchange rates** — plus usage statistics that
persist across sessions and clients. Built for the Purple LAB "Backend Developer 2026" case study.

> **Status: live in production.** API, frontend, DynamoDB, and SST infra are deployed to AWS
> (`eu-central-1`).
>
> - **Web:** https://dqgxfioaxo6x7.cloudfront.net
> - **API:** https://q8vdmae029.execute-api.eu-central-1.amazonaws.com
>   (`/api/convert?from=&to=&amount=`, `/api/currencies`, `/api/stats`)
>
> Redeploy with `pnpm sst deploy --stage production` after setting the App ID secret (see Deploy below).

## Documentation map

| Audience                  | Doc                                                                         |
| ------------------------- | --------------------------------------------------------------------------- |
| **Agents** (Claude, etc.) | [`CLAUDE.md`](./CLAUDE.md) — architecture, invariants, commands             |
| **Humans — vision**       | [`GOAL.md`](./GOAL.md) — north-star / definition of done                    |
| **Humans — decisions**    | [`docs/adr/`](./docs/adr) — Architecture Decision Records (ADR-0001–0009)   |
| **Security**              | [`docs/security.md`](./docs/security.md) — threat model & control checklist |

## Architecture (summary)

A TypeScript monorepo on AWS, with all infrastructure as code via SST. Full detail in
[`CLAUDE.md`](./CLAUDE.md) §4 and [`GOAL.md`](./GOAL.md) §5.

```
/packages/core        # pure conversion + cache + stats logic (no AWS deps, fully unit-tested)
/packages/functions   # AWS Lambda handlers (thin adapters over core)
/web                  # Next.js frontend (App Router)
/sst.config.ts        # infra: DynamoDB tables, API Gateway, Next.js site, App ID Secret
```

## Prerequisites

- **Node 22** (see `.nvmrc`) and **pnpm** (pinned via `packageManager`; `corepack enable` provides it)
- An [openexchangerates.org](https://openexchangerates.org/signup/free) App ID (free plan)
- AWS credentials configured locally (for `sst dev` / `sst deploy`)

## Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

   This also sets up Git hooks via Husky (`prepare`).

2. Set the openexchangerates App ID as an SST Secret (it is a **secret** — never committed):

   ```bash
   sst secret set OpenExchangeRatesAppId YOUR_APP_ID_HERE
   ```

   The App ID is injected into the Lambda functions by SST at deploy time.
   It is **never** shipped to the browser bundle — the frontend talks only to our API.

3. Run the dev stack:
   ```bash
   sst dev
   ```
   This starts a local proxy for the API and the Next.js dev server.

## Deploy

Manual deploy from a trusted machine (with AWS credentials configured):

```bash
pnpm sst secret set OpenExchangeRatesAppId YOUR_APP_ID_HERE --stage production  # if not already set
pnpm sst deploy --stage production
```

`sst deploy` produces a live public URL serving the three API endpoints and the Next.js site.
All infrastructure is defined in `sst.config.ts` (SST v4).

**Production CI/CD** (GitHub Actions → AWS via OIDC, **no AWS keys stored in GitHub**) is
documented in [`infra/aws/README.md`](./infra/aws/README.md): on every CI-green push to `main`,
the `deploy` workflow assumes a repo-scoped IAM role with a short-lived token and runs
`sst deploy --stage production`. The App ID lives only in AWS SSM — never in GitHub.

## Commands

Run from the repo root:

```bash
pnpm format               # Prettier write
pnpm format:check         # Prettier check (CI)
pnpm lint                 # ESLint
pnpm lint:fix             # ESLint autofix
pnpm typecheck            # tsc -b (core + functions)
pnpm test                 # Vitest (unit + integration)
pnpm --filter @currency/web build  # Next.js production build
```

The quality gate runs automatically: **pre-commit** (Prettier + ESLint on staged files),
**commit-msg** (Conventional Commits), **pre-push** (typecheck), and **CI** (the full suite).
See [`CLAUDE.md`](./CLAUDE.md) §8.

## Testing

Vitest: unit tests in `packages/core/test/` (conversion math, rounding, cache policy, validation,
stats) + integration tests in `packages/functions/test/` (handlers with the provider and DynamoDB
**mocked**). Tests **never** call the live provider or AWS.

```bash
pnpm test          # run all tests
pnpm test:watch    # watch mode
```
