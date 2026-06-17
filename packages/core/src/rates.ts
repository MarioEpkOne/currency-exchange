/** Rate cache TTL in seconds (matches openexchangerates hourly refresh). */
export const RATE_TTL_SECONDS = 3600;

/** Currency-list cache TTL in seconds (names rarely change). */
export const CURRENCY_TTL_SECONDS = 86400;

export type CacheState = 'fresh' | 'expired' | 'absent';

/**
 * Determine the state of a cached item given its fetchedAt timestamp.
 *
 * @param fetchedAt  ISO-8601 string (or null if no cache item exists)
 * @param ttlSeconds  TTL for this item type
 * @param now  current epoch milliseconds (injectable for testability)
 * @returns 'absent' | 'fresh' | 'expired'
 *
 * Handler consumption rule (implemented in the Lambda handlers):
 *   fresh   → use, stale:false
 *   expired → try provider first; if provider fails, serve as stale:true + asOf=fetchedAt
 *   absent  → must fetch from provider; if provider also fails → NO_RATES_AVAILABLE (503)
 */
export function cacheState(fetchedAt: string | null, ttlSeconds: number, now: number): CacheState {
  if (fetchedAt === null) {
    return 'absent';
  }

  const fetchedAtMs = new Date(fetchedAt).getTime();
  const expiresAtMs = fetchedAtMs + ttlSeconds * 1000;

  if (now < expiresAtMs) {
    return 'fresh';
  }

  return 'expired';
}
