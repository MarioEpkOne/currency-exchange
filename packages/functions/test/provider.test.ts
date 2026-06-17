import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLatest, fetchCurrencies } from '../src/lib/provider.js';
import { AppError } from '@currency/core';

// provider.ts uses the global fetch and reads the App ID from env. We stub both so
// the real parsing/error branches (untested by the handler-level module mocks) run.

const realFetch = global.fetch;

function mockFetch(impl: (url: string) => Promise<Response>) {
  global.fetch = vi.fn(impl as unknown as typeof fetch) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env['OPENEXCHANGERATES_APP_ID'] = 'test-app-id-SECRET';
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('provider.fetchLatest', () => {
  it('parses a valid payload → rates + fetchedAt from timestamp*1000', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({ timestamp: 1_700_000_000, rates: { EUR: 0.92, JPY: 162.34 } }),
          {
            status: 200,
          },
        ),
    );

    const out = await fetchLatest();
    expect(out.rates).toEqual({ EUR: 0.92, JPY: 162.34 });
    expect(out.fetchedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('non-2xx (429 quota exceeded) → PROVIDER_ERROR', async () => {
    mockFetch(async () => new Response('{"error":"quota"}', { status: 429 }));
    await expect(fetchLatest()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('network throw → PROVIDER_ERROR (AppError)', async () => {
    mockFetch(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(fetchLatest()).rejects.toBeInstanceOf(AppError);
    await expect(fetchLatest()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('non-JSON body → PROVIDER_ERROR', async () => {
    mockFetch(async () => new Response('<html>503</html>', { status: 200 }));
    await expect(fetchLatest()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('missing/!object rates field → PROVIDER_ERROR', async () => {
    mockFetch(async () => new Response(JSON.stringify({ timestamp: 1 }), { status: 200 }));
    await expect(fetchLatest()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('never leaks the App ID in the thrown error', async () => {
    mockFetch(async () => new Response('error body', { status: 500 }));
    try {
      await fetchLatest();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('test-app-id-SECRET');
    }
  });
});

describe('provider.fetchCurrencies', () => {
  it('returns the currency map on success', async () => {
    mockFetch(
      async () => new Response(JSON.stringify({ USD: 'US Dollar', EUR: 'Euro' }), { status: 200 }),
    );
    expect(await fetchCurrencies()).toEqual({ USD: 'US Dollar', EUR: 'Euro' });
  });

  it('non-2xx (403) → PROVIDER_ERROR', async () => {
    mockFetch(async () => new Response('forbidden', { status: 403 }));
    await expect(fetchCurrencies()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('non-JSON body → PROVIDER_ERROR', async () => {
    mockFetch(async () => new Response('<html>', { status: 200 }));
    await expect(fetchCurrencies()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});
