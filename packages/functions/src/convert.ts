import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  cacheState,
  parseConvertRequest,
  validateConvertShape,
  convert as coreConvert,
  usdValue,
  supportedFromRates,
  noRatesAvailable,
  AppError,
  RATE_TTL_SECONDS,
} from '@currency/core';
import * as dynamo from './lib/dynamo.js';
import * as provider from './lib/provider.js';
import { ok, fail, logEvent } from './lib/respond.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const reqId = randomUUID();
  const startMs = Date.now();
  const requestOrigin = event.headers?.['origin'] ?? event.headers?.['Origin'];
  const query = event.queryStringParameters ?? {};

  try {
    // 0. Validate input shape FIRST (presence, format, amount range).
    // This must run before any rate-loading so that malformed requests always
    // return 400, even when there is no cache and the provider is down (Edge Cases
    // table: bad input → 400 unconditionally, regardless of cache state).
    // Currency membership is checked later in step 2, once rates are available.
    validateConvertShape({
      from: query['from'],
      to: query['to'],
      amount: query['amount'],
    });

    // 1. Load rate snapshot from cache
    const snapshot = await dynamo.getRateSnapshot();
    const state = cacheState(snapshot?.fetchedAt ?? null, RATE_TTL_SECONDS, Date.now());

    let rates = snapshot?.rates;
    let fetchedAt = snapshot?.fetchedAt ?? new Date().toISOString();
    let stale = false;
    let cacheHit = false;

    if (state === 'fresh') {
      // Cache hit — use as-is, no provider call
      cacheHit = true;
      stale = false;
      rates = snapshot!.rates;
      fetchedAt = snapshot!.fetchedAt;
    } else {
      // Cache absent or expired — try provider
      try {
        const fresh = await provider.fetchLatest();
        await dynamo.putRateSnapshot(fresh.rates, fresh.fetchedAt);
        rates = fresh.rates;
        fetchedAt = fresh.fetchedAt;
        stale = false;
      } catch {
        // Provider failed — use cache as fallback if available
        if (state === 'absent' || snapshot === null) {
          throw noRatesAvailable();
        }
        // Cache is expired — serve stale
        rates = snapshot.rates;
        fetchedAt = snapshot.fetchedAt;
        stale = state === 'expired';
      }
    }

    // 2. Validate request (throws AppError on invalid input)
    const supported = supportedFromRates(rates!);
    const parsed = parseConvertRequest(
      { from: query['from'], to: query['to'], amount: query['amount'] },
      supported,
    );

    // 3. Convert
    const { result, rate } = coreConvert(parsed.amount, parsed.from, parsed.to, rates!);

    // 4. Build response
    const convertResult = {
      from: parsed.from,
      to: parsed.to,
      amount: parsed.amount.toFixed(parsed.amount.decimalPlaces() ?? 0),
      result: result.toFixed(result.decimalPlaces() ?? 0),
      rate: rate.toFixed(rate.decimalPlaces() ?? 6),
      asOf: fetchedAt,
      stale,
    };

    // 5. Record stats (best-effort — failure must not fail the conversion)
    try {
      const usd = usdValue(parsed.amount, parsed.from, rates!);
      await dynamo.recordConversion(parsed.to, usd.toString());
    } catch (statsErr) {
      logEvent({
        reqId,
        route: 'convert',
        from: parsed.from,
        to: parsed.to,
        cacheHit,
        stale,
        status: 200,
        ms: Date.now() - startMs,
      });
      // Do NOT rethrow — stats failure must not affect the 200 response
      void statsErr;
    }

    const response = ok(convertResult, requestOrigin);

    logEvent({
      reqId,
      route: 'convert',
      from: parsed.from,
      to: parsed.to,
      cacheHit,
      stale,
      status: 200,
      ms: Date.now() - startMs,
    });

    return response;
  } catch (err) {
    const response = fail(err, requestOrigin);
    const status = err instanceof AppError ? err.httpStatus : 500;

    logEvent({
      reqId,
      route: 'convert',
      cacheHit: false,
      stale: false,
      status,
      ms: Date.now() - startMs,
    });

    return response;
  }
};
