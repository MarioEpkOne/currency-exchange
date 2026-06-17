# ADR-0002: Use decimal.js with ROUND_HALF_EVEN for all money arithmetic

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The system performs currency conversion involving division (USD triangulation: `rates[to] / rates[from]`) and
multiplication. Native JavaScript floats produce cumulative rounding errors that are unacceptable for a money
system (e.g. `0.1 + 0.2 !== 0.3`). The ESLint config already enforces no `parseFloat`/`Number.parseFloat`
on money as a guardrail (CLAUDE.md §5.1). A decimal library must be chosen.

Additionally, the rounding mode must be selected. The two most common are:

- `ROUND_HALF_UP` — common in consumer contexts; biases sums upward.
- `ROUND_HALF_EVEN` (banker's rounding) — minimizes cumulative bias; the financial standard.

## Decision

We will use **decimal.js** for all money arithmetic, with the rounding mode configured globally as
`Decimal.ROUND_HALF_EVEN` via `Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })` in
`packages/core/src/money.ts`. All amounts are held as `Decimal` internally and formatted to
currency-specific decimal places only at the boundary (never hardcode 2 dp — JPY=0, etc.).

## Consequences

- Money values are exact at every arithmetic step; rounding happens once, at the output boundary.
- `packages/core` has a runtime dependency on `decimal.js` (pure JS, no AWS — boundary is preserved).
- dinero.js is not used; its value-object model adds complexity without benefit for this ratio-based triangulation.
- The `dpFor(code)` helper defaults unknown codes to 2 with a warning — a logged deviation, not a silent bug.

## Alternatives considered

- **dinero.js** — immutable value objects, good for multi-currency arithmetic. Adds conceptual overhead
  for the simple `amount * (rates[to] / rates[from])` pattern; ruled out.
- **Native JS numbers** — rejected; violates CLAUDE.md §5.1 and produces incorrect results on boundary cases.
- **ROUND_HALF_UP** — common default; produces upward bias in aggregate sums. Ruled out in favor of
  the financial standard.
