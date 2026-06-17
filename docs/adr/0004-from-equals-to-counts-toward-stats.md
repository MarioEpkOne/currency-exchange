# ADR-0004: from == to conversions count toward stats

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

When a user requests a conversion with `from == to`, the API short-circuits: it returns the amount
unchanged with `rate: 1` and `result: amount`. This is a valid 200 response per the Edge Cases table.

The question is whether this counts toward `totalCount`, `totalSumUSD`, and `targetCounts` in the
stats table. There are two options:

1. Count it — simpler rule: every 200 from `/api/convert` increments stats.
2. Skip it — "no real conversion happened", so stats are only about cross-currency conversions.

## Decision

We will count every 200 response from `/api/convert` toward stats, including `from == to` requests.
Rule: **every 200 from `/api/convert` counts.**

This is implemented in `packages/functions/src/convert.ts`: `recordConversion` is called after
any successful `convert()` call, regardless of whether `from === to`.

## Consequences

- Stats logic is simpler — one rule, no special-casing.
- `totalCount` reflects total usage, not just cross-currency conversions.
- `from == to` conversions add their USD value to `totalSumUSD` (the amount divided by its own rate = the amount itself, normalized to USD). This is correct and unbiased.

## Alternatives considered

- **Skip from==to** — would require a conditional in the handler. Adds complexity with no
  clear benefit for the use case.
