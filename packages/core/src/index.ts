// Types
export type {
  Currency,
  RatesMap,
  RateSnapshot,
  CurrencyList,
  ConvertResult,
  CurrenciesResponse,
  StatsResponse,
  ParsedConvertRequest,
} from './types.js';

// Error model
export type { ErrorCode } from './errors.js';
export {
  AppError,
  missingParam,
  unsupportedCurrency,
  invalidAmount,
  noRatesAvailable,
  providerError,
  internalError,
} from './errors.js';

// Money helpers
export { Decimal, CURRENCY_DP, dpFor, roundToCurrency, formatMoney } from './money.js';

// Currency helpers
export { isWellFormedCode, isSupported, supportedFromRates } from './currencies.js';

// Validation
export { parseConvertRequest, validateConvertShape } from './validate.js';

// Conversion
export { rateBetween, convert, usdValue } from './convert.js';

// Cache policy
export { cacheState, RATE_TTL_SECONDS, CURRENCY_TTL_SECONDS } from './rates.js';
export type { CacheState } from './rates.js';

// Stats
export { topCurrency, buildStatsResponse } from './stats.js';
