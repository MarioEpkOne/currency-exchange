# Pipeline Learnings

## HIGH

---

## MEDIUM

---

## LOW

### Plan prescribed control-flow that contradicted the authoritative Edge Cases table

**Date**: 2026-06-17 15:53
**Phase affected**: Phase 2 (impl-plan) → surfaced in Phase 4 (audit)
**Occurrences**: 1
**Seen in**: spec--currency-exchange-implementation, project: /mnt/c/Users/Epkone/CurrencyExchange
**What happened**: The plan's handler step ordered rate-loading before input validation, so a malformed request could return 503 instead of the Edge-Cases-mandated 400; the planner checked that each edge case was _handled_ but not that step _ordering_ preserved precedence, and the audit (not the plan) caught it.
**Suggestion**: When a spec designates an Edge Cases / behavior table as authoritative, the planner should add an explicit "control-flow precedence" check — verify the _order_ of operations in each step honors the table (e.g. validation-before-side-effects, 4xx-before-5xx), not just that every row is handled somewhere.
**Suggested diff**:
File: `commands/impl-plan.md`

```diff
+ When the spec marks an Edge Cases / behavior table as authoritative, cross-check step
+ control-flow ORDER against it, not just coverage: ensure input validation precedes any
+ side-effecting or failure-prone operation so client errors (4xx) cannot be pre-empted by
+ dependency errors (5xx). Record the intended ordering in the affected step.
```
