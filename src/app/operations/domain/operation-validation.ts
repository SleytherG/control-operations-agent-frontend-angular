/**
 * Frontend domain: operation type enum and amount parsing.
 * No framework imports — pure TypeScript.
 * Amount parsing never converts through JavaScript Number to avoid floating-point loss.
 */

export enum OperationType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

/** Maps API operation type values to Spanish display labels shown to the user. */
export const OPERATION_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Depósito',
  WITHDRAWAL: 'Retiro',
};

/**
 * Returns the Spanish display label for an operation type value.
 * Falls back to the raw value if no label is found.
 */
export function formatOperationType(type: string): string {
  return OPERATION_TYPE_LABELS[type] ?? type;
}

export type ParseAmountSuccess = { ok: true; canonical: string };
export type ParseAmountFailure = { ok: false; error: string };
export type ParseAmountResult = ParseAmountSuccess | ParseAmountFailure;

/**
 * Parse a locale-formatted amount string to its canonical dot-separated form.
 * Never converts through JavaScript Number — all validation is string-based.
 *
 * @param raw          Raw input from the operator (browser-locale decimal separator)
 * @param decimalSep   The decimal separator character for the current locale ('.' or ',')
 * @returns            ParseAmountResult with ok=true and canonical string, or ok=false with error
 */
export function parseAmount(raw: string, decimalSep: string): ParseAmountResult {
  if (!raw || raw.trim() === '') {
    return { ok: false, error: 'Amount is required' };
  }

  // Reject exponent notation
  if (/[eE]/.test(raw)) {
    return { ok: false, error: 'Amount must not use exponent notation' };
  }

  // Reject plus prefix
  if (raw.startsWith('+')) {
    return { ok: false, error: 'Amount must not start with +' };
  }

  // Normalize: replace locale decimal separator with canonical dot
  const normalized = decimalSep === ',' ? raw.replace(',', '.') : raw;

  // Validate structure: optional minus, digits, optional dot + up to 2 digits
  // Pattern: negative or positive decimal with at most 2 fractional digits, no exponent
  const pattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
  if (!pattern.test(normalized)) {
    return {
      ok: false,
      error: 'Amount must be a valid decimal number with at most two decimal places',
    };
  }

  // Reject negative
  if (normalized.startsWith('-')) {
    return { ok: false, error: 'Amount must be positive' };
  }

  // Reject zero (handle "0" and "0.00" etc.)
  const [intPart, fracPart] = normalized.split('.');
  const isZero =
    parseInt(intPart, 10) === 0 && (!fracPart || parseInt(fracPart, 10) === 0);
  if (isZero) {
    return { ok: false, error: 'Amount must be positive (greater than zero)' };
  }

  return { ok: true, canonical: normalized };
}

/**
 * Build the canonical request payload from validated type and canonical amount.
 * The payload is stable: same inputs always produce the same JSON key order.
 */
export function buildCanonicalPayload(
  type: string,
  canonicalAmount: string
): { type: string; amount: string } {
  return { type, amount: canonicalAmount };
}

/**
 * Detect the browser's decimal separator from Intl.NumberFormat.
 */
export function getDecimalSeparator(): string {
  try {
    const formatted = new Intl.NumberFormat(navigator.language).format(1.1);
    // Find the separator between the two '1's
    return formatted[1] ?? '.';
  } catch {
    return '.';
  }
}
