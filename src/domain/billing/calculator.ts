// src/domain/billing/calculator.ts — Pure invoice total calculator.
//
// Sums the gross line amounts (qty × unitPriceCents), sums the
// per-line discount cents, then computes tax on the post-discount
// subtotal. All math is integer-cents only.
//
// Negative line amounts are supported: proration invoices have one
// negative line (the unused-cycle credit) and one positive line (the
// new-plan charge); the calculator simply sums them.
//
// No DB access, no side effects. Unit-testable in isolation.

import { percentOf } from '@/lib/money';
import type { BillingLine, InvoiceTotals } from './types';

/**
 * Calculate the totals for an invoice from its billing lines and a tax
 * percent (integer 0..100).
 *
 *   subtotalCents = Σ (qty × unitPriceCents)               (gross)
 *   discountCents = Σ percentOf(gross, discountPercent)     (per line)
 *   taxCents      = percentOf(subtotal − discount, taxPct)
 *   totalCents    = subtotal − discount + tax
 *
 * Negative gross values are folded in as-is so proration credits net
 * out against the new-cycle charges.
 */
export function calculateInvoice(
  lines: BillingLine[],
  taxPercent: number,
): InvoiceTotals {
  if (lines.length === 0) {
    return {
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
    };
  }

  let subtotalCents = 0;
  let discountCents = 0;
  for (const line of lines) {
    const gross = Math.round(line.qty * line.unitPriceCents);
    const discount = percentOf(gross, line.discountPercent);
    subtotalCents += gross;
    discountCents += discount;
  }

  const taxableCents = subtotalCents - discountCents;
  const taxCents = percentOf(taxableCents, taxPercent);
  const totalCents = taxableCents + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
  };
}
