# ADR-0001: Record architecture decisions in ADRs

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner

## Context

This project intentionally defers several mechanism-level decisions in its vision doc (see
[`CLAUDE.md`](../../CLAUDE.md) §9 and [`GOAL.md`](../../GOAL.md) §10). As those decisions are made
during implementation, we need a durable, reviewable record of *why* — so future contributors
(human or agent) don't silently re-litigate or undo them.

## Decision

We will capture significant, hard-to-reverse decisions as **Architecture Decision Records** in
`docs/adr/`, using the lightweight [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Each ADR is immutable once accepted; a change is a new ADR that supersedes the old one. ADRs are
committed in the same PR as the code they justify.

## Consequences

- Decisions are discoverable and reviewable; the "why" survives staff/agent turnover.
- A small per-decision authoring cost — accepted, because money-handling correctness depends on
  these choices being explicit (decimal library, cache TTL, stats atomicity).
- [`CLAUDE.md`](../../CLAUDE.md) §9 stays the live "open questions" list; closing an item produces
  an ADR.

## Alternatives considered

- **Decisions only in CLAUDE.md / commit messages** — too easy to lose the rationale and the
  alternatives considered; commit messages aren't browsable as a coherent set.
- **A wiki** — splits the history from the code and isn't versioned alongside it.
