import type { ConvertResult, CurrenciesResponse, StatsResponse } from '@currency/core';

// API base URL injected by SST at build time.
// NEVER includes the openexchangerates App ID — the browser talks only to our API.
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    let errorBody: ApiErrorBody;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      throw new ApiClientError('NETWORK_ERROR', response.status, 'Network error');
    }
    throw new ApiClientError(
      errorBody.error?.code ?? 'UNKNOWN',
      response.status,
      errorBody.error?.message ?? 'An error occurred',
    );
  }

  return response.json() as Promise<T>;
}

export async function getCurrencies(): Promise<CurrenciesResponse> {
  return request<CurrenciesResponse>(`${API_BASE}/api/currencies`);
}

export async function convert(from: string, to: string, amount: string): Promise<ConvertResult> {
  const params = new URLSearchParams({ from, to, amount });
  return request<ConvertResult>(`${API_BASE}/api/convert?${params.toString()}`);
}

export async function getStats(): Promise<StatsResponse> {
  return request<StatsResponse>(`${API_BASE}/api/stats`);
}
