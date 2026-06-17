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

- [ ] decimal.js vs dinero.js for money math
- [ ] DynamoDB table/key design + atomic-counter mechanism for concurrent stats writes
- [ ] Exact rate-cache TTL value
- [ ] Whether `from == to` conversions count toward stats
- [ ] Formal REST request/response + error-body schemas

## Index

- [ADR-0001](./0001-record-architecture-decisions.md) — Record architecture decisions in ADRs
