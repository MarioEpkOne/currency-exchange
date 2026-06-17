## What & why

<!-- What does this change do, and why? Link the spec / ADR / issue. -->

## Same-PR documentation (anti-drift)

- [ ] **CLAUDE.md** updated if this changed architecture, an invariant, a command, or a module boundary
- [ ] **README** updated if setup / run / deploy steps changed
- [ ] **ADR** added under `docs/adr/` if this resolved a deferred decision (CLAUDE.md §9)
- [ ] **API docs** (OpenAPI) regenerated if an endpoint contract changed

## Quality gate

- [ ] Lint + format pass
- [ ] Typecheck passes
- [ ] Tests pass (provider mocked — no live API calls in tests)
- [ ] Money math goes through the decimal library, not native floats (if applicable)

## Risk / rollback

<!-- Anything risky here? How would you roll this back? -->
