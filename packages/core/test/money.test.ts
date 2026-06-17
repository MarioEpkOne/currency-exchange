import { describe, it, expect } from 'vitest';
import { Decimal, dpFor, roundToCurrency, formatMoney } from '../src/money.js';

describe('dpFor', () => {
  it('returns 2 for USD', () => {
    expect(dpFor('USD')).toBe(2);
  });

  it('returns 0 for JPY', () => {
    expect(dpFor('JPY')).toBe(0);
  });

  it('returns 2 for EUR', () => {
    expect(dpFor('EUR')).toBe(2);
  });

  it('defaults to 2 for unknown code', () => {
    // Unknown code — defaults to 2
    expect(dpFor('XYZ')).toBe(2);
  });
});

describe("roundToCurrency (ROUND_HALF_EVEN — banker's rounding)", () => {
  it('rounds 2.345 to 2.34 for USD (round half to even)', () => {
    const result = roundToCurrency(new Decimal('2.345'), 'USD');
    expect(result.toFixed(2)).toBe('2.34');
  });

  it('rounds 2.355 to 2.36 for USD (round half to even)', () => {
    const result = roundToCurrency(new Decimal('2.355'), 'USD');
    expect(result.toFixed(2)).toBe('2.36');
  });

  it('rounds to 0 dp for JPY', () => {
    const result = roundToCurrency(new Decimal('162.5'), 'JPY');
    expect(result.toFixed(0)).toBe('162');
  });

  it('rounds 163.5 to 164 for JPY (round half to even — odd stays)', () => {
    const result = roundToCurrency(new Decimal('163.5'), 'JPY');
    expect(result.toFixed(0)).toBe('164');
  });

  it('uses 2 dp for unknown code', () => {
    const result = roundToCurrency(new Decimal('1.005'), 'ZZZ');
    expect(result.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});

describe('formatMoney', () => {
  it('formats USD with 2 decimal places', () => {
    expect(formatMoney(new Decimal('10.1'), 'USD')).toBe('10.10');
  });

  it('formats JPY with 0 decimal places', () => {
    expect(formatMoney(new Decimal('16234.7'), 'JPY')).toBe('16235');
  });

  it('returns a string', () => {
    expect(typeof formatMoney(new Decimal('100'), 'EUR')).toBe('string');
  });
});
