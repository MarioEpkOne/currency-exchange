import type { Decimal } from 'decimal.js';

/** ISO-4217 3-letter currency code */
export type Currency = string;

/** Provider rates map (USD-base; USD implicitly = 1) */
export type RatesMap = Record<string, number>;

/** Cached rate snapshot from the provider */
export type RateSnapshot = {
  rates: RatesMap;
  fetchedAt: string; // ISO-8601
};

/** Currency code → display name */
export type CurrencyList = Record<string, string>;

/** Wire format for a successful /convert response (numeric fields as strings for precision) */
export type ConvertResult = {
  from: string;
  to: string;
  amount: string;
  result: string;
  rate: string;
  asOf: string;
  stale: boolean;
};

/** Wire format for /currencies response */
export type CurrenciesResponse = {
  currencies: CurrencyList;
  asOf: string;
  stale: boolean;
};

/** Wire format for /stats response */
export type StatsResponse = {
  totalCount: number;
  totalSumUSD: string;
  topCurrency: string | null;
};

/** Internal typed request after parsing */
export type ParsedConvertRequest = {
  from: string;
  to: string;
  amount: Decimal;
};
