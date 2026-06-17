import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dynamo — must be before any handler import
vi.mock('../src/lib/dynamo.js');

import { handler } from '../src/stats.js';
import * as dynamo from '../src/lib/dynamo.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(): APIGatewayProxyEventV2 {
  return { headers: {}, queryStringParameters: {} } as unknown as APIGatewayProxyEventV2;
}

describe('/stats handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empty state → { totalCount: 0, totalSumUSD: "0", topCurrency: null }', async () => {
    vi.mocked(dynamo.getStats).mockResolvedValue(null);
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string) as {
      totalCount: number;
      totalSumUSD: string;
      topCurrency: string | null;
    };
    expect(body.totalCount).toBe(0);
    expect(body.totalSumUSD).toBe('0');
    expect(body.topCurrency).toBeNull();
  });

  it('populated state maps through', async () => {
    vi.mocked(dynamo.getStats).mockResolvedValue({
      totalCount: 10,
      totalSumUSD: 500.75,
      targetCounts: { EUR: 5, USD: 3, JPY: 2 },
    });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string) as {
      totalCount: number;
      totalSumUSD: string;
      topCurrency: string;
    };
    expect(body.totalCount).toBe(10);
    expect(body.totalSumUSD).toBe('500.75');
    expect(body.topCurrency).toBe('EUR');
  });

  it('top-currency tie-break → lexicographically smallest', async () => {
    vi.mocked(dynamo.getStats).mockResolvedValue({
      totalCount: 6,
      totalSumUSD: 100,
      targetCounts: { EUR: 3, AUD: 3 },
    });
    const res = await handler(makeEvent());
    const body = JSON.parse(res.body as string) as { topCurrency: string };
    expect(body.topCurrency).toBe('AUD');
  });

  it('unexpected error (non-AppError) → 500 INTERNAL, generic message, no stack leak', async () => {
    vi.mocked(dynamo.getStats).mockRejectedValue(new Error('DynamoDB exploded: secret internals'));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body as string) as {
      error: { code: string; message: string; stack?: string };
    };
    expect(body.error.code).toBe('INTERNAL');
    // Must not leak the raw internal error message or a stack trace
    expect(body.error.message).not.toContain('secret internals');
    expect(body.error.stack).toBeUndefined();
  });
});
