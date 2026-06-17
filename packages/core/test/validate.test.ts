import { describe, it, expect } from 'vitest';
import { parseConvertRequest } from '../src/validate.js';
import { AppError } from '../src/errors.js';

// Supported set for all tests — includes USD, EUR, JPY, GBP, CAD
const supported = new Set(['USD', 'EUR', 'JPY', 'GBP', 'CAD']);

function parse(raw: { from?: string; to?: string; amount?: string }) {
  return parseConvertRequest(raw, supported);
}

describe('parseConvertRequest — MISSING_PARAM (checked first, before format/range)', () => {
  it('missing from → MISSING_PARAM 400', () => {
    expect.assertions(3);
    try {
      parse({ to: 'EUR', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('MISSING_PARAM');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('empty from → MISSING_PARAM 400', () => {
    expect.assertions(3);
    try {
      parse({ from: '', to: 'EUR', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('MISSING_PARAM');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('missing to → MISSING_PARAM 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'USD', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('MISSING_PARAM');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('missing amount → MISSING_PARAM 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'USD', to: 'EUR' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('MISSING_PARAM');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('empty amount → MISSING_PARAM 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'USD', to: 'EUR', amount: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('MISSING_PARAM');
      expect(err.httpStatus).toBe(400);
    }
  });
});

describe('parseConvertRequest — UNSUPPORTED_CURRENCY (after missing-param check)', () => {
  it('from="US" (malformed, not 3 letters) → UNSUPPORTED_CURRENCY 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'US', to: 'EUR', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('UNSUPPORTED_CURRENCY');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('from="ZZZ" (not in supported set) → UNSUPPORTED_CURRENCY 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'ZZZ', to: 'EUR', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('UNSUPPORTED_CURRENCY');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('to="ZZZ" → UNSUPPORTED_CURRENCY 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'USD', to: 'ZZZ', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('UNSUPPORTED_CURRENCY');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('lowercase from → UNSUPPORTED_CURRENCY 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'usd', to: 'EUR', amount: '100' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('UNSUPPORTED_CURRENCY');
    }
  });
});

describe('parseConvertRequest — INVALID_AMOUNT (after missing-param + currency checks)', () => {
  it('amount="abc" → INVALID_AMOUNT 400', () => {
    expect.assertions(3);
    try {
      parse({ from: 'USD', to: 'EUR', amount: 'abc' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('INVALID_AMOUNT');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('amount="NaN" → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'USD', to: 'EUR', amount: 'NaN' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('amount="Infinity" → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'USD', to: 'EUR', amount: 'Infinity' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('amount="-5" → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'USD', to: 'EUR', amount: '-5' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('amount="0" → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'USD', to: 'EUR', amount: '0' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('amount="1e16" (> 1e15) → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    try {
      parse({ from: 'USD', to: 'EUR', amount: '1e16' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('amount with > 20 sig digits → INVALID_AMOUNT 400', () => {
    expect.assertions(2);
    // 21 significant digits
    try {
      parse({ from: 'USD', to: 'EUR', amount: '1.23456789012345678901' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_AMOUNT');
    }
  });

  it('does not throw a raw ZodError — must be AppError', () => {
    expect.assertions(1);
    try {
      parse({ from: 'USD', to: 'EUR', amount: 'bad' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
    }
  });
});

describe('parseConvertRequest — valid inputs', () => {
  it('valid USD→EUR 100 → returns ParsedConvertRequest', () => {
    const result = parse({ from: 'USD', to: 'EUR', amount: '100' });
    expect(result.from).toBe('USD');
    expect(result.to).toBe('EUR');
    expect(result.amount.toFixed(2)).toBe('100.00');
  });

  it('from == to is valid → returns ParsedConvertRequest', () => {
    const result = parse({ from: 'USD', to: 'USD', amount: '50' });
    expect(result.from).toBe('USD');
    expect(result.to).toBe('USD');
  });

  it('JPY → GBP valid', () => {
    const result = parse({ from: 'JPY', to: 'GBP', amount: '1000' });
    expect(result.from).toBe('JPY');
    expect(result.to).toBe('GBP');
  });

  it('amount at boundary (exactly 1e15) is valid', () => {
    const result = parse({ from: 'USD', to: 'EUR', amount: '1e15' });
    expect(result.amount.isFinite()).toBe(true);
  });
});
