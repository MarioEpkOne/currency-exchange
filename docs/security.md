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

| Threat                                     | Control                                                                                | Where              |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------ |
| Malformed / malicious input                | Validate every param with Zod at the boundary; reject with **400**, no stack trace     | invariant §5.2     |
| Secret (App ID) leakage                    | SST Secret / env only; never in the client bundle or logs; `gitleaks` scans every push | §5.6, CI           |
| Over-privileged Lambda                     | Least-privilege IAM via SST `link` — only the specific table(s) + actions, never `*`   | infra (planned)    |
| Sensitive data in logs                     | Don't log provider responses/headers carrying the App ID; redact structured logs       | handlers (planned) |
| Provider-quota / cost exhaustion (DoS-ish) | DynamoDB rate cache shields the provider; API Gateway throttling as defense-in-depth   | §5.3, infra        |
| Vulnerable dependencies                    | Committed lockfile; `pnpm audit --audit-level=high` + `gitleaks` in CI; Dependabot     | CI                 |
| Error / stack-trace disclosure             | Map errors to clean 4xx/5xx bodies; never return internals                             | invariant §5.2     |
| Stale / incorrect rates served silently    | `stale` flag + `asOf` timestamp; **503** when no cache has ever existed                | §6                 |
| Financial rounding errors                  | Decimal library only (no native floats); ESLint guards `parseFloat`; round at the end  | invariant §5.1     |
| Stats corruption under concurrency         | Atomic DynamoDB updates (`ADD`), never read-modify-write                               | invariant §5.5     |

## Out of scope (by design — `GOAL.md` §10)

Authentication / authorization, user accounts, PII storage, multi-provider failover.

## Pre-submission checklist

- [ ] No secrets in git history (`gitleaks` green)
- [ ] App ID only via env / SST Secret; absent from the web bundle
- [ ] Every API input validated; bad input → 400 with a message, no stack trace
- [ ] Lambda IAM scoped to specific tables + actions (no wildcards)
- [ ] No App ID or raw provider responses in logs
- [ ] `pnpm audit --audit-level=high` clean
- [ ] API Gateway throttling configured
