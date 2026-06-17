import Decimal from 'decimal.js';

// Configure global rounding once: banker's rounding (ROUND_HALF_EVEN).
// This is the financial standard and minimizes cumulative bias in aggregates.
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

/**
 * ISO-4217 decimal places table.
 * Unknown but provider-supported currencies default to 2 with a logged warning.
 * Never hardcode 2 globally — JPY is 0, KWD is 3, etc.
 */
export const CURRENCY_DP: Record<string, number> = {
  AED: 2,
  AUD: 2,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 0,
  ILS: 2,
  INR: 2,
  ISK: 0,
  JPY: 0,
  KRW: 0,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PLN: 2,
  RON: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TRY: 2,
  TWD: 2,
  UAH: 2,
  USD: 2,
  VND: 0,
  ZAR: 2,
};

/**
 * Returns the decimal places for a given currency code.
 * Unknown codes default to 2 and emit a console.warn.
 * The warning never contains secrets — it only contains the currency code.
 */
export function dpFor(code: string): number {
  const dp = CURRENCY_DP[code];
  if (dp === undefined) {
    // Unknown currency — default to 2 dp with a warning.
    // Using process.stderr to avoid a dependency on the DOM `console` global
    // (tsconfig.base.json has lib: ["ES2022"] with no DOM).
    process.stderr.write(
      `[money] Unknown currency dp for "${code}" — defaulting to 2. Add it to CURRENCY_DP if this is unexpected.\n`,
    );
    return 2;
  }
  return dp;
}

/**
 * Round a Decimal to the target currency's decimal places using ROUND_HALF_EVEN.
 */
export function roundToCurrency(value: Decimal, code: string): Decimal {
  return value.toDecimalPlaces(dpFor(code), Decimal.ROUND_HALF_EVEN);
}

/**
 * Format a Decimal value as a string with the target currency's decimal places.
 * Rounds using ROUND_HALF_EVEN before formatting.
 */
export function formatMoney(value: Decimal, code: string): string {
  return roundToCurrency(value, code).toFixed(dpFor(code));
}

export { Decimal };
