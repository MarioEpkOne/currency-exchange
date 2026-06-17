# ADR-0009: Product boundary — currency conversion only

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The Purple LAB case study is for a currency converter. The spec confirmed that the request's use of
the word "securities" was interpreted as **security + fintech-correctness rigor** — not building
actual securities/asset trading. The product boundary needed to be explicit.

## Decision

The product boundary is **currency conversion only**: three REST endpoints (`/api/convert`,
`/api/currencies`, `/api/stats`) providing live exchange-rate conversion with persistent stats.

No securities/asset trading, no order books, no financial instruments. The security of the money
system (correctness, validation, precision, availability) is the primary concern.

## Consequences

- Scope is tightly bounded; all implementation effort is directed at correctness and reliability.
- Out of scope (per CLAUDE.md §10): multi-provider failover, auth/accounts, historical charts,
  currencies not supported by the openexchangerates free USD-base plan.

## Alternatives considered

None — the scope was defined by the case study brief and confirmed in the interview. This ADR
records it explicitly to prevent future scope drift.
