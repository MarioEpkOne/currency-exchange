import { describe, it, expect } from 'vitest';
import { topCurrency, buildStatsResponse } from '../src/stats.js';

describe('topCurrency', () => {
  it('returns null for empty map', () => {
    expect(topCurrency({})).toBeNull();
  });

  it('returns the single currency', () => {
    expect(topCurrency({ USD: 5 })).toBe('USD');
  });

  it('returns the currency with the highest count', () => {
    expect(topCurrency({ USD: 10, EUR: 20, JPY: 5 })).toBe('EUR');
  });

  it('on a tie picks lexicographically smallest code', () => {
    // AUD < EUR alphabetically, both have count 3
    expect(topCurrency({ EUR: 3, AUD: 3 })).toBe('AUD');
  });

  it('on a three-way tie picks lexicographically smallest', () => {
    expect(topCurrency({ USD: 5, EUR: 5, AUD: 5 })).toBe('AUD');
  });

  it('tie-break works with GBP and USD at same count', () => {
    // GBP < USD alphabetically
    expect(topCurrency({ USD: 10, GBP: 10 })).toBe('GBP');
  });
});

describe('buildStatsResponse', () => {
  it('returns zeros/null for null input', () => {
    const result = buildStatsResponse(null);
    expect(result).toEqual({ totalCount: 0, totalSumUSD: '0', topCurrency: null });
  });

  it('returns zeros/null for empty object', () => {
    const result = buildStatsResponse({});
    expect(result.totalCount).toBe(0);
    expect(result.totalSumUSD).toBe('0.00');
    expect(result.topCurrency).toBeNull();
  });

  it('maps totalCount correctly', () => {
    const result = buildStatsResponse({ totalCount: 42, totalSumUSD: '100.00', targetCounts: {} });
    expect(result.totalCount).toBe(42);
  });

  it('formats totalSumUSD as 2-dp string', () => {
    const result = buildStatsResponse({
      totalCount: 1,
      totalSumUSD: '12345.6789',
      targetCounts: {},
    });
    expect(result.totalSumUSD).toBe('12345.68');
  });

  it('handles totalSumUSD as number', () => {
    const result = buildStatsResponse({ totalCount: 5, totalSumUSD: 99.5, targetCounts: {} });
    expect(result.totalSumUSD).toBe('99.50');
  });

  it('computes topCurrency from targetCounts', () => {
    const result = buildStatsResponse({
      totalCount: 10,
      totalSumUSD: '500',
      targetCounts: { EUR: 5, USD: 3, JPY: 7 },
    });
    expect(result.topCurrency).toBe('JPY');
  });

  it('tie-break in topCurrency → lexicographically smallest', () => {
    const result = buildStatsResponse({
      totalCount: 6,
      totalSumUSD: '100',
      targetCounts: { EUR: 3, AUD: 3 },
    });
    expect(result.topCurrency).toBe('AUD');
  });
});
