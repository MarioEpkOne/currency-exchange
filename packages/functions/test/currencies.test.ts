import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/dynamo.js');
vi.mock('../src/lib/provider.js');

import { handler } from '../src/currencies.js';
import * as dynamo from '../src/lib/dynamo.js';
import * as provider from '../src/lib/provider.js';
import { AppError } from '@currency/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(): APIGatewayProxyEventV2 {
  return { headers: {}, queryStringParameters: {} } as unknown as APIGatewayProxyEventV2;
}

const FRESH_FETCHED_AT = new Date(Date.now() - 1000).toISOString(); // 1s ago — within 24h TTL
const EXPIRED_FETCHED_AT = new Date(Date.now() - 90_000_000).toISOString(); // ~25h ago — expired

const SAMPLE_CURRENCIES = { USD: 'United States Dollar', EUR: 'Euro', JPY: 'Japanese Yen' };

describe('/currencies handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cache hit (fresh) → serves cache, provider NOT called', async () => {
    vi.mocked(dynamo.getCurrencyList).mockResolvedValue({
      currencies: SAMPLE_CURRENCIES,
      fetchedAt: FRESH_FETCHED_AT,
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as {
      currencies: Record<string, string>;
      stale: boolean;
    };
    expect(body.currencies).toEqual(SAMPLE_CURRENCIES);
    expect(body.stale).toBe(false);
    expect(provider.fetchCurrencies).not.toHaveBeenCalled();
  });

  it('cache miss → fetches from provider and caches result', async () => {
    vi.mocked(dynamo.getCurrencyList).mockResolvedValue(null);
    vi.mocked(provider.fetchCurrencies).mockResolvedValue(SAMPLE_CURRENCIES);
    vi.mocked(dynamo.putCurrencyList).mockResolvedValue(undefined);

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(provider.fetchCurrencies).toHaveBeenCalledOnce();
    expect(dynamo.putCurrencyList).toHaveBeenCalledOnce();

    const body = JSON.parse(res.body as string) as { stale: boolean };
    expect(body.stale).toBe(false);
  });

  it('provider fails with stale cache → serves stale:true', async () => {
    vi.mocked(dynamo.getCurrencyList).mockResolvedValue({
      currencies: SAMPLE_CURRENCIES,
      fetchedAt: EXPIRED_FETCHED_AT,
    });
    vi.mocked(provider.fetchCurrencies).mockRejectedValue(
      new AppError('PROVIDER_ERROR', 502, 'down'),
    );

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body as string) as { stale: boolean };
    expect(body.stale).toBe(true);
  });

  it('provider fails, no cache → 503 NO_RATES_AVAILABLE', async () => {
    vi.mocked(dynamo.getCurrencyList).mockResolvedValue(null);
    vi.mocked(provider.fetchCurrencies).mockRejectedValue(
      new AppError('PROVIDER_ERROR', 502, 'down'),
    );

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.body as string) as { error: { code: string } };
    expect(body.error.code).toBe('NO_RATES_AVAILABLE');
  });
});
