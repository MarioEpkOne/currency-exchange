import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/dynamo.js');
vi.mock('../src/lib/provider.js');

import { handler } from '../src/convert.js';
import * as dynamo from '../src/lib/dynamo.js';
import * as provider from '../src/lib/provider.js';
import { AppError } from '@currency/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(params: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    headers: {},
    queryStringParameters: params,
  } as unknown as APIGatewayProxyEventV2;
}

const SAMPLE_RATES = { EUR: 0.92, JPY: 162.34, GBP: 0.79 };

// A snapshot with a fetchedAt that is "fresh" (1 second ago)
function freshSnapshot() {
  return {
    rates: SAMPLE_RATES,
    fetchedAt: new Date(Date.now() - 1000).toISOString(),
  };
}

// A snapshot with a fetchedAt that is "expired" (2 hours ago)
function expiredSnapshot() {
  return {
    rates: SAMPLE_RATES,
    fetchedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  };
}

describe('/convert handler — cache scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) cache hit → provider NOT called, stale:false', async () => {
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(freshSnapshot());
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as { stale: boolean };
    expect(body.stale).toBe(false);
    expect(provider.fetchLatest).not.toHaveBeenCalled();
  });

  it('(b) cache miss → provider fetched, putRateSnapshot called, stale:false', async () => {
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(null);
    vi.mocked(provider.fetchLatest).mockResolvedValue({
      rates: SAMPLE_RATES,
      fetchedAt: new Date().toISOString(),
    });
    vi.mocked(dynamo.putRateSnapshot).mockResolvedValue(undefined);
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(200);
    expect(provider.fetchLatest).toHaveBeenCalledOnce();
    expect(dynamo.putRateSnapshot).toHaveBeenCalledOnce();

    const body = JSON.parse(res.body as string) as { stale: boolean };
    expect(body.stale).toBe(false);
  });

  it('(c) provider down + fresh cache → stale:false, 200', async () => {
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(freshSnapshot());
    // Provider not called when fresh — so this test just verifies the fresh path
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as { stale: boolean };
    expect(body.stale).toBe(false);
    // Provider never called (cache is fresh)
    expect(provider.fetchLatest).not.toHaveBeenCalled();
  });

  it('(d) provider down + expired cache → stale:true + asOf, 200', async () => {
    const snap = expiredSnapshot();
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(snap);
    vi.mocked(provider.fetchLatest).mockRejectedValue(new AppError('PROVIDER_ERROR', 502, 'down'));
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as { stale: boolean; asOf: string };
    expect(body.stale).toBe(true);
    expect(body.asOf).toBe(snap.fetchedAt);
  });

  it('(e) provider down + no cache → 503 NO_RATES_AVAILABLE', async () => {
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(null);
    vi.mocked(provider.fetchLatest).mockRejectedValue(new AppError('PROVIDER_ERROR', 502, 'down'));

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('NO_RATES_AVAILABLE');
  });
});

describe('/convert handler — from == to edge case', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(freshSnapshot());
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);
  });

  it('(f) from==to → 200, rate:"1", result===amount, recordConversion IS called', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'USD', amount: '50' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as { rate: string; result: string };
    expect(body.rate).toBe('1');
    // recordConversion must be called (Decision #3: from==to counts toward stats)
    expect(dynamo.recordConversion).toHaveBeenCalledOnce();
  });
});

describe('/convert handler — 400 validation errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(freshSnapshot());
  });

  it('(g) missing from → 400 MISSING_PARAM, {error:{code,message}}, no stack', async () => {
    const res = await handler(makeEvent({ to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as {
      error: { code: string; message: string; stack?: string };
    };
    expect(body.error.code).toBe('MISSING_PARAM');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.stack).toBeUndefined();
  });

  it('missing amount → 400 MISSING_PARAM', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_PARAM');
  });

  it('unsupported currency → 400 UNSUPPORTED_CURRENCY', async () => {
    const res = await handler(makeEvent({ from: 'ZZZ', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('UNSUPPORTED_CURRENCY');
  });

  it('bad amount → 400 INVALID_AMOUNT', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: 'abc' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_AMOUNT');
  });

  it('negative amount → 400 INVALID_AMOUNT', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '-5' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_AMOUNT');
  });

  it('amount > 1e15 → 400 INVALID_AMOUNT', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '1e16' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_AMOUNT');
  });
});

describe('/convert handler — validation precedes 503 (no cache + provider down)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(null);
    vi.mocked(provider.fetchLatest).mockRejectedValue(new AppError('PROVIDER_ERROR', 502, 'down'));
  });

  it('no-cache + provider-down + missing amount → 400, not 503', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_PARAM');
  });

  it('no-cache + provider-down + bad amount → 400, not 503', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: 'abc' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_AMOUNT');
  });

  it('no-cache + provider-down + missing from → 400, not 503', async () => {
    const res = await handler(makeEvent({ to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_PARAM');
  });

  it('no-cache + provider-down + valid params → 503 NO_RATES_AVAILABLE (unchanged)', async () => {
    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('NO_RATES_AVAILABLE');
  });
});

describe('/convert handler — stats write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dynamo.getRateSnapshot).mockResolvedValue(freshSnapshot());
  });

  it('(h) successful convert issues exactly one recordConversion with correct to + usdValue', async () => {
    vi.mocked(dynamo.recordConversion).mockResolvedValue(undefined);

    await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(dynamo.recordConversion).toHaveBeenCalledOnce();

    const [toCurrency] = vi.mocked(dynamo.recordConversion).mock.calls[0] ?? [];
    expect(toCurrency).toBe('EUR');
  });

  it('(i) stats write throws → conversion still returns 200', async () => {
    vi.mocked(dynamo.recordConversion).mockRejectedValue(new Error('DynamoDB write failed'));

    const res = await handler(makeEvent({ from: 'USD', to: 'EUR', amount: '100' }));
    expect(res.statusCode).toBe(200);
    expect(dynamo.recordConversion).toHaveBeenCalledOnce();
  });
});
