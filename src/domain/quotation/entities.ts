// src/domain/quotation/entities.ts — Quotation domain entities.
// These are pure data shapes; the database schema uses Prisma models but
// the domain layer works with these typed shapes.

import type { BillingType, PlanInterval, QuoteStatus, RiskBand } from '@/lib/enums';

export interface QuoteLineInput {
  id?: string;
  productId: string;
  productName: string;
  billingType: BillingType;
  interval?: PlanInterval;
  intervalCount?: number;
  qty: number;
  unitPriceCents: number;
  discountPercent: number;
  /** Cost per unit in cents, optional (margin treated as 0 if missing). */
  costCents?: number;
  /** Allowed discount percent resolved from policy (set by risk engine). */
  allowedDiscountPercent?: number;
}

export interface QuoteLineResult extends QuoteLineInput {
  grossCents: number;
  discountCents: number;
  netCents: number;
  costTotalCents: number;
  marginCents: number;
  marginPct: number;
}

export interface QuoteTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  estimatedCostCents: number;
  estimatedMarginCents: number;
  estimatedMarginPct: number;
  totalDiscountPct: number;
}

export interface QuoteCalcResult {
  lines: QuoteLineResult[];
  totals: QuoteTotals;
}

export interface QuoteSnapshot {
  id: string;
  number: string;
  customerId: string;
  ownerName: string;
  customerName: string;
  customerTier: string;
  status: QuoteStatus;
  revision: number;
  currency: string;
  totals: QuoteTotals;
  riskScore?: number;
  riskBand?: RiskBand;
  lines: QuoteLineResult[];
  notes?: string;
  expectedDeliveryDate?: string;
  createdAt: string;
  submittedAt?: string;
  confirmedAt?: string;
}

/** Minimum/maximum values enforced by the domain. */
export const LIMITS = {
  MIN_QTY: 1,
  MAX_QTY: 10_000,
  MIN_DISCOUNT_PCT: 0,
  MAX_DISCOUNT_PCT: 100,
  MIN_PRICE_CENTS: 0,
  MAX_PRICE_CENTS: 1_000_000_00, // $1M
  MIN_TAX_PCT: 0,
  MAX_TAX_PCT: 100,
} as const;
