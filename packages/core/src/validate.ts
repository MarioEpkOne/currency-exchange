import { z } from 'zod';
import { Decimal } from './money.js';
import { isWellFormedCode, isSupported } from './currencies.js';
import { missingParam, unsupportedCurrency, invalidAmount, AppError } from './errors.js';
import type { ParsedConvertRequest } from './types.js';

/** Maximum amount value allowed (DoS/abuse cap) */
const MAX_AMOUNT = new Decimal('1e15');

/** Maximum significant digits allowed (DoS/abuse cap) */
const MAX_SIG_DIGITS = 20;

/**
 * Raw query params schema — validates only that values are present strings.
 * Deeper validation happens below so we can produce the right error codes.
 */
const rawSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  amount: z.string().optional(),
});

/**
 * Parse and validate a raw convert request query object.
 *
 * Validation order (Edge Cases table precedence):
 * 1. Missing from/to/amount → MISSING_PARAM (400) — checked FIRST before any format/range check
 * 2. from/to not [A-Z]{3} or not in supported set → UNSUPPORTED_CURRENCY (400)
 * 3. amount non-numeric/NaN/Inf/neg/zero/too-large/too-many-digits → INVALID_AMOUNT (400)
 *
 * Throws AppError on any validation failure. Never throws a raw ZodError.
 */
export function parseConvertRequest(
  raw: { from?: string | undefined; to?: string | undefined; amount?: string | undefined },
  supported: ReadonlySet<string>,
): ParsedConvertRequest {
  // Step 1: Check for missing parameters BEFORE any other validation.
  // This ensures missing params always produce MISSING_PARAM, not UNSUPPORTED_CURRENCY.
  const parsedRaw = rawSchema.safeParse(raw);
  if (!parsedRaw.success) {
    // rawSchema is all optional so this path is extremely unlikely; treat as internal
    throw missingParam('from');
  }

  const { from, to, amount } = parsedRaw.data;

  // Missing-param checks first (precedence rule from Edge Cases table)
  if (from === undefined || from.trim() === '') {
    throw missingParam('from');
  }
  if (to === undefined || to.trim() === '') {
    throw missingParam('to');
  }
  if (amount === undefined || amount.trim() === '') {
    throw missingParam('amount');
  }

  // Step 2: Currency format + support checks
  if (!isWellFormedCode(from) || !isSupported(from, supported)) {
    throw unsupportedCurrency(from);
  }
  if (!isWellFormedCode(to) || !isSupported(to, supported)) {
    throw unsupportedCurrency(to);
  }

  // Step 3: Amount validation — use Decimal, never parseFloat
  let amountDecimal: Decimal;
  try {
    amountDecimal = new Decimal(amount);
  } catch {
    throw invalidAmount(`"${amount}" is not a valid number`);
  }

  if (!amountDecimal.isFinite()) {
    throw invalidAmount(`"${amount}" must be a finite number (NaN and Infinity are not allowed)`);
  }

  if (amountDecimal.lte(0)) {
    throw invalidAmount(
      `"${amount}" must be greater than zero (negative and zero amounts are not allowed)`,
    );
  }

  if (amountDecimal.gt(MAX_AMOUNT)) {
    throw invalidAmount(`"${amount}" exceeds the maximum allowed amount (1e15)`);
  }

  // significant digits check: .sd() returns the number of significant digits
  if (amountDecimal.sd(true) > MAX_SIG_DIGITS) {
    throw invalidAmount(`"${amount}" has too many significant digits (max 20)`);
  }

  return { from, to, amount: amountDecimal };
}

export { AppError };
