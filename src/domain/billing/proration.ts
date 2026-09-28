// src/domain/billing/proration.ts — Calendar-aware proration math.
//
// All math is integer-cents only. The proration formula:
//   proratedAmount = round(cyclePriceCents * remainingDays / cycleDays)
// mirrors `src/lib/money.ts`'s `prorate()` helper so behavior stays
// consistent across the codebase.
//
// `daysInInterval` returns the total calendar days in a billing cycle
// starting at `startDate` — e.g. MONTHLY from Jan 1 = 31 days, MONTHLY
// from Feb 1 (2025) = 28 days, ANNUAL from 2026-01-01 = 365 days.

import type { PlanInterval } from '@/lib/enums';
import { prorate } from '@/lib/money';
import type { ProrationInput } from './types';
import { advanceDate } from './interval-helper';

/**
 * Return the prorated amount (integer cents) for a partial billing
 * cycle. Delegates to `prorate()` so the formula is identical across
 * the codebase.
 */
export function proratedAmount(input: ProrationInput): number {
  const { cyclePriceCents, remainingDays, cycleDays } = input;
  if (cycleDays <= 0) return 0;
  if (remainingDays <= 0) return 0;
  return prorate(cyclePriceCents, remainingDays, cycleDays);
}

/**
 * Return the total calendar days in one billing cycle of the given
 * interval starting at `startDate`. Useful for proration when the
 * caller already knows the start of the cycle.
 *
 *   MONTHLY     → days from startDate to startDate+1 month
 *   QUARTERLY   → days from startDate to startDate+3 months (×intervalCount)
 *   ANNUAL      → days from startDate to startDate+1 year (×intervalCount)
 *
 * `intervalCount` defaults to 1.
 */
export function daysInInterval(
  interval: PlanInterval,
  intervalCount = 1,
  startDate: Date = new Date(),
): number {
  const next = advanceDate(startDate, interval, intervalCount);
  const ms = next.getTime() - startDate.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}
