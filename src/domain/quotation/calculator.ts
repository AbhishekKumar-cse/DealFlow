// src/domain/quotation/calculator.ts — Pure quote calculation functions.
// No side effects, no DB access. Used by the application service and by
// unit tests.

import type {
  QuoteCalcResult,
  QuoteLineInput,
  QuoteLineResult,
  QuoteTotals,
} from './entities';
import {
  applyPercent,
  percentOf,
  roundCents,
} from '@/lib/money';
import { LIMITS } from './entities';
import { InvalidLineError } from './errors';

/** Compute a single quote line: gross, discount, net, cost, margin. */
export function calculateLine(line: QuoteLineInput): QuoteLineResult {
  validateLine(line);

  const grossCents = roundCents(line.qty * line.unitPriceCents);
  const discountCents = percentOf(grossCents, line.discountPercent);
  const netCents = grossCents - discountCents;
  const costTotalCents = line.costCents != null ? line.qty * line.costCents : 0;
  const marginCents = netCents - costTotalCents;
  const marginPct =
    grossCents > 0 ? Math.round((marginCents / grossCents) * 100) : 0;

  return {
    ...line,
    grossCents,
    discountCents,
    netCents,
    costTotalCents,
    marginCents,
    marginPct,
  };
}

/** Compute the whole quote totals from a set of lines + tax percent. */
export function calculateQuote(
  lines: QuoteLineInput[],
  taxPercent = 0,
): QuoteCalcResult {
  if (lines.length === 0) {
    return {
      lines: [],
      totals: zeroTotals(),
    };
  }

  const calculatedLines = lines.map(calculateLine);
  const subtotalCents = calculatedLines.reduce((s, l) => s + l.grossCents, 0);
  const discountCents = calculatedLines.reduce((s, l) => s + l.discountCents, 0);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = percentOf(taxableCents, taxPercent);
  const totalCents = taxableCents + taxCents;
  const estimatedCostCents = calculatedLines.reduce(
    (s, l) => s + l.costTotalCents,
    0,
  );
  const estimatedMarginCents = taxableCents - estimatedCostCents;
  const estimatedMarginPct =
    subtotalCents > 0 ? Math.round((estimatedMarginCents / subtotalCents) * 100) : 0;
  const totalDiscountPct =
    subtotalCents > 0 ? Math.round((discountCents / subtotalCents) * 100) : 0;

  const totals: QuoteTotals = {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    estimatedCostCents,
    estimatedMarginCents,
    estimatedMarginPct,
    totalDiscountPct,
  };

  return { lines: calculatedLines, totals };
}

function zeroTotals(): QuoteTotals {
  return {
    subtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 0,
    estimatedCostCents: 0,
    estimatedMarginCents: 0,
    estimatedMarginPct: 0,
    totalDiscountPct: 0,
  };
}

function validateLine(line: QuoteLineInput): void {
  if (!Number.isInteger(line.qty) || line.qty < LIMITS.MIN_QTY) {
    throw new InvalidLineError(
      `Quantity must be a positive integer (got ${line.qty}).`,
    );
  }
  if (line.qty > LIMITS.MAX_QTY) {
    throw new InvalidLineError(
      `Quantity exceeds maximum of ${LIMITS.MAX_QTY}.`,
    );
  }
  if (line.unitPriceCents < LIMITS.MIN_PRICE_CENTS) {
    throw new InvalidLineError('Unit price cannot be negative.');
  }
  if (line.unitPriceCents > LIMITS.MAX_PRICE_CENTS) {
    throw new InvalidLineError('Unit price exceeds maximum.');
  }
  if (
    line.discountPercent < LIMITS.MIN_DISCOUNT_PCT ||
    line.discountPercent > LIMITS.MAX_DISCOUNT_PCT
  ) {
    throw new InvalidLineError('Discount percent must be 0..100.');
  }
  if (line.costCents != null && line.costCents < 0) {
    throw new InvalidLineError('Cost cannot be negative.');
  }
  if (line.billingType === 'RECURRING' && !line.interval) {
    throw new InvalidLineError('Recurring line requires an interval.');
  }
}
