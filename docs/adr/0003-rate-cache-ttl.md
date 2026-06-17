# ADR-0003: Rate cache TTL 3600s; currency-list cache TTL 86400s

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Project owner / interview

## Context

The openexchangerates free plan refreshes rates approximately hourly. The DynamoDB cache stores
the rate snapshot with a `ttl` attribute (epoch seconds) for automatic item expiry. The TTL value
must balance rate freshness against provider quota usage.

The currency list changes very rarely (new currencies are added infrequently) and is more expensive
to refetch needlessly. A longer TTL is appropriate.

## Decision

- **Rate cache TTL:** `3600` seconds (1 hour) — matches the provider's stated refresh cadence.
  `ttl = floor(fetchedAt_epoch) + 3600`.
- **Currency-list cache TTL:** `86400` seconds (24 hours). Currency names and codes rarely change.
  `ttl = floor(fetchedAt_epoch) + 86400`.

Both TTLs are exported as constants from `packages/core/src/rates.ts`:
`RATE_TTL_SECONDS = 3600`, `CURRENCY_TTL_SECONDS = 86400`.

## Consequences

- Rate freshness is at most 1 hour behind the provider during normal operation.
- The currency list may be up to 24 hours behind. Acceptable for names/codes that rarely change.
- On an expired cache with a live provider, the handler fetches fresh data and writes back.
- On an expired cache with a dead provider, the expired data is served as `stale:true`. This is
  the "availability over freshness" invariant (CLAUDE.md §5.4).

## Alternatives considered

- **Shorter TTL (e.g. 15 min)** — would increase provider API calls beyond quota limits on a
  free plan with many cold-start Lambda invocations. Ruled out.
- **Longer TTL (e.g. 12h for rates)** — rates would be stale; unhelpful for a converter.
