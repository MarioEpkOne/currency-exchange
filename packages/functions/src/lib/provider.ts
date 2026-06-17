import { providerError } from '@currency/core';
import type { RatesMap, CurrencyList } from '@currency/core';

/** App ID from SST Secret-linked env. NEVER logged or serialized into responses. */
function getAppId(): string {
  const appId = process.env['OPENEXCHANGERATES_APP_ID'];
  if (!appId) {
    // Fail loudly at startup, not at request time, so the issue is obvious in logs.
    // The error message does NOT include the env value (it's empty anyway).
    throw new Error('OPENEXCHANGERATES_APP_ID environment variable is not set.');
  }
  return appId;
}

const BASE_URL = 'https://openexchangerates.org/api';

/**
 * Fetch the latest USD-base exchange rates from openexchangerates.
 *
 * On any non-2xx response, network error, or malformed payload:
 * → throws AppError.providerError() (caught by the handler for cache-fallback logic).
 *
 * NEVER logs the App ID or raw provider response/headers.
 */
export async function fetchLatest(): Promise<{ rates: RatesMap; fetchedAt: string }> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/latest.json?app_id=${getAppId()}`);
  } catch {
    // Network error — treat as provider-down
    throw providerError();
  }

  if (!response.ok) {
    // Non-2xx status — treat as provider-down, do not log body (may contain quota info)
    throw providerError();
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw providerError();
  }

  // Validate shape without using parseFloat/Number on money
  if (
    typeof data !== 'object' ||
    data === null ||
    !('rates' in data) ||
    typeof (data as Record<string, unknown>)['rates'] !== 'object'
  ) {
    throw providerError();
  }

  const raw = data as { rates: Record<string, number>; timestamp?: number };
  const fetchedAt =
    raw.timestamp !== undefined
      ? new Date(raw.timestamp * 1000).toISOString()
      : new Date().toISOString();

  return { rates: raw.rates, fetchedAt };
}

/**
 * Fetch the currency list from openexchangerates.
 *
 * On any error → throws AppError.providerError().
 * NEVER logs the App ID or raw response.
 */
export async function fetchCurrencies(): Promise<CurrencyList> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/currencies.json?app_id=${getAppId()}`);
  } catch {
    throw providerError();
  }

  if (!response.ok) {
    throw providerError();
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw providerError();
  }

  if (typeof data !== 'object' || data === null) {
    throw providerError();
  }

  return data as CurrencyList;
}
