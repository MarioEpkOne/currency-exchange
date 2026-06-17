# ADR-0005: Single atomic aggregate item STATS#GLOBAL for stats

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

Stats must be shared across all Lambda invocations (multiple concurrent instances) and must survive
restarts. The main challenge is concurrent writes — multiple Lambdas can process conversions
simultaneously and must update a shared aggregate without racing.

DynamoDB supports atomic `UpdateItem` with expression-based arithmetic (`ADD`, `SET if_not_exists`),
which is concurrency-safe by construction. The alternative — read-modify-write — is not.

## Decision

We will use a **single aggregate item** with `PK = 'STATS#GLOBAL'` in the `Stats` table, updated
with one atomic `UpdateItem` per successful conversion:

```
UpdateExpression:
  ADD totalCount :one, totalSumUSD :usd
  SET targetCounts.#cur = if_not_exists(targetCounts.#cur, :zero) + :one
ExpressionAttributeNames:  { '#cur': <TO currency> }
ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':usd': <usdValue as Number> }
```

`topCurrency` (argmax of `targetCounts`) is computed in-app by `packages/core/src/stats.ts`
after reading the item. Tie-break is lexicographically smallest code (deterministic).

## Consequences

- All concurrent writes are safe — each UpdateItem is atomic.
- No read-modify-write; no optimistic-locking retry loop needed.
- `totalSumUSD` is stored as a DynamoDB `Number` (decimal-string precision via `ADD`); read back
  wrapped in `Decimal` for formatting.
- `targetCounts` is a DynamoDB Map attribute updated with `SET if_not_exists ... + :one`.
- `topCurrency` computation adds a tiny in-app cost on each `/api/stats` read; acceptable.

## Alternatives considered

- **Per-currency items** — would require a query + aggregation across items on every stats read.
  Adds complexity; no benefit for this scale.
- **Read-modify-write with conditional check** — requires retry on conflict; eliminates concurrency
  safety; rejected.
- **DynamoDB Streams aggregation** — correct for very high throughput, but massive overkill here.
  Adds another Lambda + stream + deployment complexity.
