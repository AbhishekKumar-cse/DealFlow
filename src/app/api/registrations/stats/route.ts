// src/app/api/registrations/stats/route.ts — Registration stats.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getLogicDetailsDb } from '@/lib/logic-details-db';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const db = getLogicDetailsDb();

  const total = (db.prepare('SELECT COUNT(*) AS c FROM RegistrationDetails').get() as { c: number }).c;
  const active = (db.prepare("SELECT COUNT(*) AS c FROM RegistrationDetails WHERE status = 'ACTIVE'").get() as { c: number }).c;
  const byRole = db
    .prepare('SELECT role, COUNT(*) AS count FROM RegistrationDetails GROUP BY role ORDER BY count DESC')
    .all() as { role: string; count: number }[];
  const byCountry = db
    .prepare("SELECT country, COUNT(*) AS count FROM RegistrationDetails WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10")
    .all() as { country: string; count: number }[];
  const last7 = (db.prepare("SELECT COUNT(*) AS c FROM RegistrationDetails WHERE createdAt >= datetime('now', '-7 days')").get() as { c: number }).c;
  const last30 = (db.prepare("SELECT COUNT(*) AS c FROM RegistrationDetails WHERE createdAt >= datetime('now', '-30 days')").get() as { c: number }).c;
  const neverLoggedIn = (db.prepare("SELECT COUNT(*) AS c FROM RegistrationDetails WHERE lastLoginAt IS NULL").get() as { c: number }).c;

  return NextResponse.json({
    total,
    active,
    suspended: total - active,
    byRole,
    byCountry,
    last7Days: last7,
    last30Days: last30,
    neverLoggedIn,
  });
});
