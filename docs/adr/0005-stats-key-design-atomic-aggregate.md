# ADR-0005: Single atomic aggregate item STATS#GLOBAL for stats

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

Stats must be shared across all Lambda invocations (multiple concurrent instances) and must survive
restarts. The main challenge is concurrent writes — multiple Lambdas can process conversions
simultaneously and must update a shared aggregate without racing.

DynamoDB supports atomic `UpdateItem` with expression-based arithmetic (e.g. `ADD`), which is
concurrency-safe by construction. The alternative — read-modify-write — is not.

## Decision

We will use a **single aggregate item** with `PK = 'STATS#GLOBAL'` in the `Stats` table, updated
with one atomic `UpdateItem` per successful conversion. Per-currency frequency is stored as
**top-level `tc_<CUR>` attributes** incremented with `ADD` (not as keys inside a nested map):

```
UpdateExpression:           ADD totalCount :one, totalSumUSD :usd, #tc :one
ExpressionAttributeNames:   { '#tc': 'tc_' + <TO currency> }
ExpressionAttributeValues:  { ':one': {N:'1'}, ':usd': {N: <usdValue decimal string>} }
```

`topCurrency` (argmax) is computed in-app by `packages/core/src/stats.ts`; `getStats` rebuilds the
`{ CUR: count }` map from the `tc_*` attributes before handing it to core. Tie-break is
lexicographically smallest code (deterministic).

> **Why flat `tc_<CUR>` attributes, not a nested `targetCounts` map** (revised 2026-06-17 after the
> first live deploy): the original design used `SET targetCounts.#cur = if_not_exists(targetCounts.#cur, :zero) + :one`.
> That fails on the **first ever write** — DynamoDB rejects a nested document path whose parent map
> does not yet exist (`ValidationException: document path ... invalid for update`), so the whole
> atomic update fails and stats never persist. Mocked unit tests did not catch it (a mock does not
> enforce DynamoDB path semantics); a live smoke test did. Top-level `ADD` creates the item and the
> attribute atomically, so it is correct on the first write and remains a single concurrency-safe
> `UpdateItem`. The money sum is also **read** as its raw decimal string (low-level `GetItem`), never
> unmarshaled through a JS float.

## Consequences

- All concurrent writes are safe — each UpdateItem is atomic.
- No read-modify-write; no optimistic-locking retry loop needed.
- `totalSumUSD` is stored as a DynamoDB `Number` (decimal-string precision via `ADD`); read back as
  its raw decimal string (low-level `GetItem`) and wrapped in `Decimal` for formatting — no float.
- Per-currency frequency is stored as flat top-level `tc_<CUR>` attributes incremented via `ADD`, and
  reconstructed into a `{ CUR: count }` map on read by `getStats` (NOT a nested map — see the note
  above on why the nested path fails on first write).
- `topCurrency` computation adds a tiny in-app cost on each `/api/stats` read; acceptable.

## Alternatives considered

- **Per-currency items** — would require a query + aggregation across items on every stats read.
  Adds complexity; no benefit for this scale.
- **Read-modify-write with conditional check** — requires retry on conflict; eliminates concurrency
  safety; rejected.
- **DynamoDB Streams aggregation** — correct for very high throughput, but massive overkill here.
  Adds another Lambda + stream + deployment complexity.
