import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
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
  // Single atomic UpdateItem. Per-currency frequency is stored as a TOP-LEVEL
  // attribute `tc_<CUR>` incremented with ADD — NOT as a key inside a nested map.
  //
  // Why not `SET targetCounts.#cur = ...`: on the first ever write the parent map
  // `targetCounts` does not exist, and DynamoDB rejects a nested document path whose
  // parent is missing (ValidationException: "document path ... invalid for update"),
  // so the whole update fails and stats never persist. ADD creates the item and the
  // attribute atomically, so it is correct on the first write and concurrency-safe
  // (no read-modify-write). The USD value is passed as a raw { N: string } so it is
  // never coerced through a JS native float (Constraint #1: no native-float money).
  await ddbClient.send(
    new UpdateItemCommand({
      TableName: STATS_TABLE,
      Key: { PK: { S: 'STATS#GLOBAL' } },
      UpdateExpression: 'ADD totalCount :one, totalSumUSD :usd, #tc :one',
      ExpressionAttributeNames: {
        '#tc': `tc_${toCurrency}`,
      },
      ExpressionAttributeValues: {
        ':one': { N: '1' },
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
  totalSumUSD?: string;
  targetCounts?: Record<string, number>;
} | null> {
  // Low-level GetItem (not DocumentClient) so the money sum is read as its raw
  // decimal string and NOT unmarshaled through a JS float. Per-currency counters
  // are reconstructed from the top-level `tc_<CUR>` attributes written by
  // recordConversion back into the { CUR: count } map the core layer expects.
  const result = await ddbClient.send(
    new GetItemCommand({
      TableName: STATS_TABLE,
      Key: { PK: { S: 'STATS#GLOBAL' } },
    }),
  );

  if (!result.Item) return null;

  const item = result.Item;
  const totalCount = item['totalCount']?.N !== undefined ? Number(item['totalCount'].N) : 0;
  // Kept as the raw decimal string — exact, no float coercion.
  const totalSumUSD = item['totalSumUSD']?.N ?? '0';

  const targetCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith('tc_') && value.N !== undefined) {
      targetCounts[key.slice(3)] = Number(value.N);
    }
  }

  return { totalCount, totalSumUSD, targetCounts };
}
