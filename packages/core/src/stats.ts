import { Decimal } from './money.js';
import type { StatsResponse } from './types.js';

/**
 * Compute the top (most frequently used) target currency from a counts map.
 *
 * Tie-breaking: lexicographically smallest code (deterministic).
 * Empty map → null.
 */
export function topCurrency(targetCounts: Record<string, number>): string | null {
  const entries = Object.entries(targetCounts);
  if (entries.length === 0) {
    return null;
  }

  let topCode: string | null = null;
  let topCount = -1;

  for (const [code, count] of entries) {
    if (count > topCount || (count === topCount && topCode !== null && code < topCode)) {
      topCode = code;
      topCount = count;
    }
  }

  return topCode;
}

/**
 * Build a StatsResponse from a raw DynamoDB stats item (or null for empty state).
 * totalSumUSD is returned as a 2-dp string (via Decimal) for precision on the wire.
 */
export function buildStatsResponse(
  item: {
    totalCount?: number;
    totalSumUSD?: string | number;
    targetCounts?: Record<string, number>;
  } | null,
): StatsResponse {
  if (item === null || item === undefined) {
    return { totalCount: 0, totalSumUSD: '0', topCurrency: null };
  }

  const totalCount = item.totalCount ?? 0;
  const rawSum = item.totalSumUSD;
  const totalSumUSD = rawSum !== undefined ? new Decimal(String(rawSum)).toFixed(2) : '0.00';
  const top = topCurrency(item.targetCounts ?? {});

  return { totalCount, totalSumUSD, topCurrency: top };
}
