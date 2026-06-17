import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { RatesMap, CurrencyList, RateSnapshot } from '@currency/core';
import { RATE_TTL_SECONDS, CURRENCY_TTL_SECONDS } from '@currency/core';

// Table names injected by SST link — never hardcoded
const RATE_CACHE_TABLE = process.env['RATE_CACHE_TABLE'] ?? '';
const STATS_TABLE = process.env['STATS_TABLE'] ?? '';

// Module-level client (reused across warm invocations)
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// ─── Rate Cache ────────────────────────────────────────────────────────────────

/**
 * Get the cached USD rate snapshot.
 * Returns null if no item exists.
 */
export async function getRateSnapshot(): Promise<RateSnapshot | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: RATE_CACHE_TABLE,
      Key: { PK: 'RATES#USD' },
    }),
  );

  if (!result.Item) return null;

  return {
    rates: result.Item['rates'] as RatesMap,
    fetchedAt: result.Item['fetchedAt'] as string,
  };
}

/**
 * Write (or overwrite) the USD rate snapshot.
 * TTL = fetchedAt epoch + RATE_TTL_SECONDS (so DynamoDB auto-deletes after 1h).
 */
export async function putRateSnapshot(rates: RatesMap, fetchedAt: string): Promise<void> {
  const fetchedAtEpoch = Math.floor(new Date(fetchedAt).getTime() / 1000);
  const ttl = fetchedAtEpoch + RATE_TTL_SECONDS;

  await docClient.send(
    new PutCommand({
      TableName: RATE_CACHE_TABLE,
      Item: {
        PK: 'RATES#USD',
        rates,
        fetchedAt,
        ttl,
      },
    }),
  );
}

/**
 * Get the cached currency list.
 * Returns null if no item exists.
 */
export async function getCurrencyList(): Promise<{
  currencies: CurrencyList;
  fetchedAt: string;
} | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: RATE_CACHE_TABLE,
      Key: { PK: 'CURRENCIES' },
    }),
  );

  if (!result.Item) return null;

  return {
    currencies: result.Item['currencies'] as CurrencyList,
    fetchedAt: result.Item['fetchedAt'] as string,
  };
}

/**
 * Write (or overwrite) the currency list cache.
 * TTL = fetchedAt epoch + CURRENCY_TTL_SECONDS (24h).
 */
export async function putCurrencyList(currencies: CurrencyList, fetchedAt: string): Promise<void> {
  const fetchedAtEpoch = Math.floor(new Date(fetchedAt).getTime() / 1000);
  const ttl = fetchedAtEpoch + CURRENCY_TTL_SECONDS;

  await docClient.send(
    new PutCommand({
      TableName: RATE_CACHE_TABLE,
      Item: {
        PK: 'CURRENCIES',
        currencies,
        fetchedAt,
        ttl,
      },
    }),
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Record a successful conversion atomically.
 * Uses a single UpdateItem with ADD (counter increment) and SET if_not_exists
 * to avoid read-modify-write races under concurrent Lambda invocations.
 *
 * @param toCurrency  the target currency code
 * @param usdValueDecimalString  the USD-normalized value as a decimal string
 */
export async function recordConversion(
  toCurrency: string,
  usdValueDecimalString: string,
): Promise<void> {
  // Use the low-level UpdateItemCommand (not DocumentClient) so the USD value is
  // supplied as a raw DynamoDB Number string { N: "..." } — never coerced through
  // a JS native float (which would violate Constraint #1: no native-float money).
  await ddbClient.send(
    new UpdateItemCommand({
      TableName: STATS_TABLE,
      Key: { PK: { S: 'STATS#GLOBAL' } },
      UpdateExpression:
        'ADD totalCount :one, totalSumUSD :usd SET targetCounts.#cur = if_not_exists(targetCounts.#cur, :zero) + :one',
      ExpressionAttributeNames: {
        '#cur': toCurrency,
      },
      ExpressionAttributeValues: {
        ':one': { N: '1' },
        ':zero': { N: '0' },
        // Decimal string passed directly — full precision, no float coercion
        ':usd': { N: usdValueDecimalString },
      },
    }),
  );
}

/**
 * Get the global stats item.
 * Returns null if no item exists (no conversions ever recorded).
 */
export async function getStats(): Promise<{
  totalCount?: number;
  totalSumUSD?: string | number;
  targetCounts?: Record<string, number>;
} | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: STATS_TABLE,
      Key: { PK: 'STATS#GLOBAL' },
    }),
  );

  if (!result.Item) return null;

  return result.Item as {
    totalCount?: number;
    totalSumUSD?: string | number;
    targetCounts?: Record<string, number>;
  };
}
