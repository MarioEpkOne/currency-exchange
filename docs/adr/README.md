# Architecture Decision Records

We record every significant, hard-to-reverse decision as an ADR — a short, immutable note capturing
the context, the decision, and its consequences. ADRs are the human-readable history of _why_ the
system is the way it is.

## When to write one

Write an ADR when you:

- resolve a decision deferred in [`CLAUDE.md`](../../CLAUDE.md) §9 (see the open list below);
- choose a library, pattern, or module boundary that future contributors shouldn't silently undo;
- change a previously recorded decision — write a **new** ADR that supersedes the old one. Never
  rewrite history; mark the old record `Superseded by ADR-XXXX`.

## How

1. Copy [`template.md`](./template.md) to `NNNN-short-title.md` (next number, zero-padded).
2. Fill it in — keep it short, one decision per record.
3. Commit it **in the same PR** as the change it explains.

## Open decisions awaiting an ADR (from CLAUDE.md §9)

- [x] decimal.js vs dinero.js for money math → ADR-0002
- [x] DynamoDB table/key design + atomic-counter mechanism for concurrent stats writes → ADR-0005
- [x] Exact rate-cache TTL value → ADR-0003
- [x] Whether `from == to` conversions count toward stats → ADR-0004
- [x] Formal REST request/response + error-body schemas → ADR-0006

## Index

- [ADR-0001](./0001-record-architecture-decisions.md) — Record architecture decisions in ADRs
- [ADR-0002](./0002-decimal-library-and-rounding.md) — Use decimal.js with ROUND_HALF_EVEN
- [ADR-0003](./0003-rate-cache-ttl.md) — Rate cache TTL 3600s; currency-list TTL 86400s
- [ADR-0004](./0004-from-equals-to-counts-toward-stats.md) — from==to counts toward stats
- [ADR-0005](./0005-stats-key-design-atomic-aggregate.md) — Single atomic aggregate item STATS#GLOBAL
- [ADR-0006](./0006-typed-json-error-envelope.md) — Typed JSON error envelope
- [ADR-0007](./0007-full-stack-single-pass-build.md) — Full-stack single-pass build
- [ADR-0008](./0008-production-hardening-controls.md) — Production hardening controls
- [ADR-0009](./0009-product-boundary-currency-only.md) — Product boundary: currency conversion only
