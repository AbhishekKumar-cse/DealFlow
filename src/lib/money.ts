// src/lib/money.ts — Integer-cents money helpers.
// All monetary values are stored as integer cents in SQLite. Decimal
// representation is reconstructed only at the presentation boundary.
//
// Default currency is INR (Indian Rupee, ₹) formatted in the Indian
// numbering system (en-IN locale: 1,00,000.00 grouping).

export type Cents = number;

export const cents = (value: number): Cents => Math.round(value);

export const fromDecimal = (decimal: number): Cents => Math.round(decimal * 100);

export const toDecimal = (value: Cents): number => value / 100;

export const addCents = (a: Cents, b: Cents): Cents => a + b;

export const subCents = (a: Cents, b: Cents): Cents => a - b;

export const mulCents = (a: Cents, factor: number): Cents =>
  Math.round(a * factor);

export const roundCents = (value: Cents): Cents => Math.round(value);

/** Apply an integer-percent discount to a cents value. */
export const applyPercent = (value: Cents, percent: number): Cents =>
  Math.round((value * (100 - percent)) / 100);

/** Percentage of a cents value (percent is integer 0..100). */
export const percentOf = (value: Cents, percent: number): Cents =>
  Math.round((value * percent) / 100);

/** Prorate a cents value over a billing cycle. */
export const prorate = (
  cyclePrice: Cents,
  remainingDays: number,
  totalDays: number,
): Cents => {
  if (totalDays <= 0) return 0;
  return Math.round((cyclePrice * remainingDays) / totalDays);
};

/**
 * Format a cents value as a currency string. Defaults to INR (Indian
 * Rupee, ₹) in the en-IN locale (Indian numbering: 1,00,000.00).
 */
export const formatCurrency = (
  value: Cents,
  currency = 'INR',
  locale = 'en-IN',
): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(toDecimal(value));

/** Compact currency format — e.g. ₹1.2L, ₹3.4Cr, ₹12.3K. Useful for dashboards. */
export const formatCurrencyCompact = (
  value: Cents,
  currency = 'INR',
): string => {
  const decimal = toDecimal(value);
  const symbol = currencySymbol(currency);
  if (decimal >= 1_00_00_000) {
    return `${symbol}${(decimal / 1_00_00_000).toFixed(2)}Cr`;
  }
  if (decimal >= 1_00_000) {
    return `${symbol}${(decimal / 1_00_000).toFixed(2)}L`;
  }
  if (decimal >= 1_000) {
    return `${symbol}${(decimal / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value, currency);
};

/** Get the currency symbol for a currency code. */
export const currencySymbol = (currency = 'INR'): string => {
  try {
    const parts = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency')?.value;
    return symbol ?? '₹';
  } catch {
    return '₹';
  }
};

export const formatPercent = (percent: number, fractionDigits = 1): string =>
  `${percent.toFixed(fractionDigits)}%`;
