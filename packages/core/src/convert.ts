import { Decimal, roundToCurrency } from './money.js';
import type { RatesMap } from './types.js';

/**
 * Compute the exchange rate between two currencies using USD triangulation.
 * rate(USD) = 1 (implicit — not in the rates map keys).
 *
 * Returns: rates[to] / rates[from]  (each relative to USD=1)
 */
export function rateBetween(rates: RatesMap, from: string, to: string): Decimal {
  const fromRate = from === 'USD' ? 1 : rates[from];
  const toRate = to === 'USD' ? 1 : rates[to];

  if (fromRate === undefined) {
    throw new Error(`Rate not found for currency "${from}"`);
  }
  if (toRate === undefined) {
    throw new Error(`Rate not found for currency "${to}"`);
  }

  return new Decimal(toRate).div(new Decimal(fromRate));
}

/**
 * Convert an amount from one currency to another.
 *
 * Edge case: from === to → short-circuit to rate=1, result=amount (rounded to currency dp).
 * All arithmetic via Decimal; round ONLY at the end to the TARGET currency's dp.
 */
export function convert(
  amount: Decimal,
  from: string,
  to: string,
  rates: RatesMap,
): { result: Decimal; rate: Decimal } {
  if (from === to) {
    return { result: roundToCurrency(amount, from), rate: new Decimal(1) };
  }

  const rate = rateBetween(rates, from, to);
  const result = roundToCurrency(amount.mul(rate), to);

  return { result, rate };
}

/**
 * Compute the USD-normalized value of an amount for stats aggregation.
 * usdValue = amount / rate[from]  (where rate[USD] = 1)
 * Rounded to 2 dp (USD) for consistent stats storage.
 */
export function usdValue(amount: Decimal, from: string, rates: RatesMap): Decimal {
  if (from === 'USD') {
    return roundToCurrency(amount, 'USD');
  }
  const fromRate = rates[from];
  if (fromRate === undefined) {
    throw new Error(`Rate not found for currency "${from}"`);
  }
  return roundToCurrency(amount.div(new Decimal(fromRate)), 'USD');
}
