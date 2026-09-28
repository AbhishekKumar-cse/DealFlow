// src/domain/billing/types.ts — Pure-domain types for the hybrid billing
// engine. One-time lines produce standalone invoices; recurring lines
// produce a Subscription + a recurring Invoice for the first cycle. The
// calculator and proration helpers operate on integer cents only.
//
// Money is integer cents throughout (see src/lib/money.ts). All
// percentage fields are integer 0..100.

import type { BillingType, PlanInterval } from '@/lib/enums';

/**
 * A single billing line, derived from a `QuoteLine` by the application
 * service. Mirrors the shape persisted as an `InvoiceLine`. The
 * `interval` + `intervalCount` fields are only meaningful when
 * `billingType === 'RECURRING'`.
 */
export interface BillingLine {
  productId: string;
  productName: string;
  billingType: BillingType;
  qty: number;
  unitPriceCents: number;
  discountPercent: number;
  /** Net line amount (grossCents - discountCents). */
  netCents: number;
  /** Optional interval for RECURRING lines. */
  interval?: PlanInterval;
  /** Optional interval count for RECURRING lines (default 1). */
  intervalCount?: number;
}

/**
 * Inputs to the proration helper. `cyclePriceCents` is the full-cycle
 * charge for the subscription (e.g. one month of a MONTHLY plan);
 * `cycleDays` is the calendar length of one full cycle and
 * `remainingDays` is the days left in the current cycle.
 */
export interface ProrationInput {
  cyclePriceCents: number;
  cycleDays: number;
  remainingDays: number;
}

/**
 * Invoice totals produced by `calculateInvoice`. All values are integer
 * cents. `taxPercent` is the integer-percent tax rate applied to the
 * post-discount subtotal.
 */
export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}
