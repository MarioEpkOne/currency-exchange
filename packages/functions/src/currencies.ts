import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { cacheState, noRatesAvailable, AppError, CURRENCY_TTL_SECONDS } from '@currency/core';
import * as dynamo from './lib/dynamo.js';
import * as provider from './lib/provider.js';
import { ok, fail, logEvent } from './lib/respond.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const reqId = randomUUID();
  const startMs = Date.now();
  const requestOrigin = event.headers?.['origin'] ?? event.headers?.['Origin'];

  try {
    // Load currency list from cache (24h TTL)
    const cached = await dynamo.getCurrencyList();
    const state = cacheState(cached?.fetchedAt ?? null, CURRENCY_TTL_SECONDS, Date.now());

    let currencies = cached?.currencies;
    let fetchedAt = cached?.fetchedAt ?? new Date().toISOString();
    let stale = false;

    if (state === 'fresh') {
      // Cache hit
      currencies = cached!.currencies;
      fetchedAt = cached!.fetchedAt;
      stale = false;
    } else {
      // Absent or expired — try provider
      try {
        const fresh = await provider.fetchCurrencies();
        const now = new Date().toISOString();
        await dynamo.putCurrencyList(fresh, now);
        currencies = fresh;
        fetchedAt = now;
        stale = false;
      } catch {
        if (state === 'absent' || cached === null) {
          throw noRatesAvailable();
        }
        // Serve stale cache
        currencies = cached.currencies;
        fetchedAt = cached.fetchedAt;
        stale = state === 'expired';
      }
    }

    const response = ok({ currencies, asOf: fetchedAt, stale }, requestOrigin);

    logEvent({ reqId, route: 'currencies', stale, status: 200, ms: Date.now() - startMs });

    return response;
  } catch (err) {
    const response = fail(err, requestOrigin);
    const status = err instanceof AppError ? err.httpStatus : 500;
    logEvent({ reqId, route: 'currencies', status, ms: Date.now() - startMs });
    return response;
  }
};
