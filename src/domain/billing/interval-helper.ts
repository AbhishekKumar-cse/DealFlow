// src/domain/billing/interval-helper.ts — Calendar-aware date math for
// billing cycles. Plain `Date` arithmetic, no external libraries.
//
// Conventions:
//   MONTHLY   → add `intervalCount` calendar months.
//   QUARTERLY → add `intervalCount * 3` calendar months.
//   ANNUAL    → add `intervalCount` calendar years.
//
// We construct the next billing date manually (year/month/day) so month
// overflow is normalized (e.g. Jan 31 + 1 month → Feb 28/29 per
// JavaScript `Date` UTC semantics).
//
// IMPORTANT: We use local time `new Date(year, monthIndex, day)` so the
// date the user sees in the UI matches the persisted value. No timezone
// conversions are applied — the application service stores the same
// `Date` object Prisma returns.

import type { PlanInterval } from '@/lib/enums';

/**
 * Return the next billing date after `date` for a cycle of the given
 * interval + intervalCount. The returned date is a fresh `Date` object;
 * `date` is not mutated.
 *
 *   MONTHLY, 1, 2026-01-15 → 2026-02-15
 *   MONTHLY, 3, 2026-01-15 → 2026-04-15
 *   QUARTERLY, 1, 2026-01-15 → 2026-04-15
 *   QUARTERLY, 2, 2026-01-15 → 2026-07-15
 *   ANNUAL, 1, 2026-01-15 → 2027-01-15
 */
export function advanceDate(
  date: Date,
  interval: PlanInterval,
  intervalCount = 1,
): Date {
  const count = Math.max(1, Math.floor(intervalCount));
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  let newYear = year;
  let newMonth = month;

  switch (interval) {
    case 'MONTHLY':
      newMonth = month + count;
      break;
    case 'QUARTERLY':
      newMonth = month + 3 * count;
      break;
    case 'ANNUAL':
      newYear = year + count;
      break;
    default:
      // Defensive — treat unknown intervals as MONTHLY.
      newMonth = month + count;
      break;
  }

  // Normalize month overflow into year increments. `new Date(y, m, d)`
  // already handles out-of-range months (m=12 → Jan of next year), but
  // we still need to normalize the year for ANNUAL — done above. For
  // day overflow (e.g. Jan 31 → Feb 31), `new Date(y, m, d)` rolls over
  // to the next month (Feb 31 → Mar 3). We intentionally clamp the day
  // to the last valid day of the target month so Jan 31 + 1 month →
  // Feb 28/29 (not Mar 3).
  newYear += Math.floor(newMonth / 12);
  newMonth = ((newMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(newYear, newMonth + 1, 0).getDate();
  const safeDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(newYear, newMonth, safeDay, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}
