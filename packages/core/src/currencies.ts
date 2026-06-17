import type { RatesMap } from './types.js';

/** True if the code is exactly 3 uppercase ASCII letters. */
export function isWellFormedCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** True if the code is well-formed AND present in the supported set. */
export function isSupported(code: string, supported: ReadonlySet<string>): boolean {
  return isWellFormedCode(code) && supported.has(code);
}

/**
 * Build a Set of all supported currency codes from a rates map.
 * The rates map is USD-base, so USD itself (= 1, not in the map keys) is explicitly included.
 */
export function supportedFromRates(rates: RatesMap): Set<string> {
  return new Set([...Object.keys(rates), 'USD']);
}
