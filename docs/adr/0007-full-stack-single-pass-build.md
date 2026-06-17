# ADR-0007: Full-stack implementation in a single pass

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The case study targets Level 2 + all bonuses: REST API + Next.js frontend + DynamoDB + live AWS
deployment + SST IaC. These layers are interdependent (types flow from core → functions → web).
The question was whether to build incrementally (Level 1 first, then add Level 2 and bonuses) or
in one complete pass.

## Decision

We will implement the **full stack in a single pass**: `packages/core` + `packages/functions` +
`web/` + `sst.config.ts` + DynamoDB design + documentation all in one implementation run.

The build order is bottom-up (core → functions → web → infra → docs) to allow each layer to be
independently verified before the next builds on it.

## Consequences

- The implementation plan is larger but delivers a complete, deployable system.
- All layers are consistent from the start; no "placeholder" code that gets replaced.
- The core package is purely unit-testable before any infra exists.
- Deferred decisions (ADR-0002 through -0009) are all resolved before code is written.

## Alternatives considered

- **Incremental (Level 1 first)** — lower risk but produces a non-deplorable intermediate state.
  Since the decisions are all resolved, a single pass is cleaner.
