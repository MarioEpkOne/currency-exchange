# Security — Threat Model & Controls

Scope: a **public, unauthenticated** currency-conversion REST API plus a Next.js frontend, running
serverless on AWS (Lambda + DynamoDB + API Gateway), defined as code with SST. Controls are
**proportionate to the actual surface** — authentication, user accounts, and PII storage are
deliberately out of scope (`GOAL.md` §10), so we don't build security theater around them.

## Assets

- **openexchangerates App ID** — the one real secret; grants access to our rate quota.
- **AWS credentials / deploy role** — infrastructure control.
- **Conversion correctness & availability** — it's money; a wrong or unavailable number is the
  primary "harm" here.
- **Integrity of the stats table** — shared, concurrently written aggregate state.

## Trust boundaries

- **Browser → our API** — fully untrusted input crosses here.
- **Our Lambda → openexchangerates** — outbound; the App ID is attached here, never exposed earlier.
- **Our Lambda → DynamoDB** — gated by IAM.

## Threats & controls

| Threat                                     | Control                                                                                        | Where                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Malformed / malicious input                | Validate every param with Zod at the boundary; reject with **400**, no stack trace             | `packages/core/src/validate.ts`                                                   |
| Secret (App ID) leakage                    | SST Secret / env only; never in the client bundle or logs; `gitleaks` scans every push         | `sst.config.ts`, `.github/workflows/secret-scan.yml`                              |
| Over-privileged Lambda                     | Least-privilege IAM via SST `link` — only the specific table(s) + actions, never `*`           | `sst.config.ts`                                                                   |
| Sensitive data in logs                     | `logEvent()` emits only safe fields; provider errors are swallowed, not logged raw             | `packages/functions/src/lib/respond.ts`, `packages/functions/src/lib/provider.ts` |
| Provider-quota / cost exhaustion (DoS-ish) | DynamoDB rate cache shields the provider; API Gateway throttling (20rps/40burst)               | `sst.config.ts`, `packages/functions/src/convert.ts`                              |
| Vulnerable dependencies                    | Committed lockfile; `pnpm audit --audit-level=high` + `gitleaks` in CI; Dependabot             | `.github/workflows/ci.yml`                                                        |
| Error / stack-trace disclosure             | `fail()` maps AppError → typed envelope; non-AppError → 500 INTERNAL, no internals             | `packages/functions/src/lib/respond.ts`                                           |
| Stale / incorrect rates served silently    | `stale` flag + `asOf` timestamp; **503** when no cache has ever existed                        | `packages/core/src/rates.ts`, `packages/functions/src/convert.ts`                 |
| Financial rounding errors                  | decimal.js only (no native floats); ESLint guards `parseFloat`; round at the end               | `packages/core/src/money.ts`                                                      |
| Stats corruption under concurrency         | Single atomic DynamoDB UpdateItem (`ADD` on flat `tc_<CUR>` counters), never read-modify-write | `packages/functions/src/lib/dynamo.ts`                                            |
| CORS attacks                               | `Access-Control-Allow-Origin` allowlist from `CORS_ALLOW_ORIGIN` env; no wildcard              | `packages/functions/src/lib/respond.ts`, `sst.config.ts`                          |

## Out of scope (by design — `GOAL.md` §10)

Authentication / authorization, user accounts, PII storage, multi-provider failover.

## Pre-submission checklist

- [ ] No secrets in git history (`gitleaks` green) — verified via `.github/workflows/secret-scan.yml`
- [ ] App ID only via env / SST Secret; absent from the web bundle — `OPENEXCHANGERATES_APP_ID` never imported in `web/`; only in `packages/functions/src/lib/provider.ts`
- [ ] Every API input validated; bad input → 400 with a message, no stack trace — `packages/core/src/validate.ts` + `packages/functions/src/lib/respond.ts`
- [ ] Lambda IAM scoped to specific tables + actions (no wildcards) — `sst.config.ts` `link` arrays
- [ ] No App ID or raw provider responses in logs — `packages/functions/src/lib/provider.ts` swallows errors; `logEvent()` only emits safe fields
- [ ] `pnpm audit --audit-level=high` clean — `pnpm audit --audit-level=high` (run locally + in CI)
- [ ] API Gateway throttling configured — `throttle: { rate: 20, burst: 40 }` in `sst.config.ts`
