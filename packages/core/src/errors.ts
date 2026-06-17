export type ErrorCode =
  | 'INVALID_AMOUNT'
  | 'UNSUPPORTED_CURRENCY'
  | 'MISSING_PARAM'
  | 'NO_RATES_AVAILABLE'
  | 'PROVIDER_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, httpStatus: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// Named constructors / helpers

export function missingParam(name: string): AppError {
  return new AppError('MISSING_PARAM', 400, `Missing required parameter: "${name}"`);
}

export function unsupportedCurrency(code: string): AppError {
  return new AppError(
    'UNSUPPORTED_CURRENCY',
    400,
    `Unsupported or unrecognized currency: "${code}". Must be a valid ISO-4217 3-letter code.`,
  );
}

export function invalidAmount(reason: string): AppError {
  return new AppError('INVALID_AMOUNT', 400, `Invalid amount: ${reason}`);
}

export function noRatesAvailable(): AppError {
  return new AppError(
    'NO_RATES_AVAILABLE',
    503,
    'Exchange rates are not available. The provider could not be reached and no cached rates exist.',
  );
}

export function providerError(): AppError {
  return new AppError(
    'PROVIDER_ERROR',
    502,
    'The exchange-rate provider returned an unexpected response.',
  );
}

export function internalError(): AppError {
  return new AppError('INTERNAL', 500, 'An unexpected error occurred. Please try again.');
}
