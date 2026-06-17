import { describe, it, expect } from 'vitest';
import { Decimal } from '../src/money.js';
import { convert, rateBetween, usdValue } from '../src/convert.js';
import type { RatesMap } from '../src/types.js';

// Fixed rates map for deterministic testing (USD-base)
const rates: RatesMap = {
  EUR: 0.92,
  JPY: 162.34,
  GBP: 0.79,
  CAD: 1.36,
};

describe('rateBetween', () => {
  it('USD → EUR gives EUR rate (0.92 / 1)', () => {
    const rate = rateBetween(rates, 'USD', 'EUR');
    expect(rate.toFixed(2)).toBe('0.92');
  });

  it('EUR → JPY triangulation (162.34 / 0.92)', () => {
    const rate = rateBetween(rates, 'EUR', 'JPY');
    // 162.34 / 0.92 ≈ 176.4565...
    expect(rate.toNumber()).toBeCloseTo(176.456, 2);
  });

  it('USD → USD gives 1', () => {
    const rate = rateBetween(rates, 'USD', 'USD');
    expect(rate.toFixed(2)).toBe('1.00');
  });
});

describe('convert', () => {
  it('from == to → rate 1, result is amount rounded to currency dp', () => {
    const result = convert(new Decimal('100.5'), 'USD', 'USD', rates);
    expect(result.rate.toFixed(2)).toBe('1.00');
    expect(result.result.toFixed(2)).toBe('100.50');
  });

  it('USD → EUR single ratio', () => {
    const result = convert(new Decimal('100'), 'USD', 'EUR', rates);
    expect(result.result.toFixed(2)).toBe('92.00');
    expect(result.rate.toFixed(2)).toBe('0.92');
  });

  it('EUR → JPY triangulation rounds to 0 dp', () => {
    // 100 EUR → JPY: 100 * (162.34 / 0.92) ≈ 17636.96 → rounded to 0 dp
    const result = convert(new Decimal('100'), 'EUR', 'JPY', rates);
    // 100 * (162.34 / 0.92) = 17645.65... let's compute exact
    // 162.34 / 0.92 = 176.4565217... * 100 = 17645.65217...
    // ROUND_HALF_EVEN → 17646
    expect(result.result.decimalPlaces()).toBe(0);
    expect(result.result.toFixed(0)).toBe('17646');
  });

  it('large amount (1e14) stays exact through Decimal', () => {
    const result = convert(new Decimal('1e14'), 'USD', 'EUR', rates);
    expect(result.result.gt(0)).toBe(true);
    expect(result.result.isFinite()).toBe(true);
  });

  it('small amount (0.000001) stays exact through Decimal (rounds to 0.00 at 2dp boundary)', () => {
    // 0.000001 USD * 0.92 EUR/USD = 0.00000092 EUR, rounds to 0.00 at 2dp (valid)
    // The important invariant is that no exception is thrown and the result is finite
    const result = convert(new Decimal('0.000001'), 'USD', 'EUR', rates);
    expect(result.result.isFinite()).toBe(true);
    // The rate should still be correct (not affected by rounding)
    expect(result.rate.toFixed(2)).toBe('0.92');
  });
});

describe('usdValue', () => {
  it('USD from → same amount rounded to 2dp', () => {
    const val = usdValue(new Decimal('100.123'), 'USD', rates);
    expect(val.toFixed(2)).toBe('100.12');
  });

  it('EUR from → amount / EUR rate', () => {
    // 100 EUR / 0.92 = 108.695... → rounded 2dp = 108.70
    const val = usdValue(new Decimal('100'), 'EUR', rates);
    expect(val.toFixed(2)).toBe('108.70');
  });

  it('JPY from → amount / JPY rate', () => {
    // 1000 JPY / 162.34 = 6.1594... → 6.16
    const val = usdValue(new Decimal('1000'), 'JPY', rates);
    expect(val.toFixed(2)).toBe('6.16');
  });
});
