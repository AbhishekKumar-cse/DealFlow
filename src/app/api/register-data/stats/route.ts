// src/app/api/register-data/stats/route.ts — Stats from register_data_db.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getRegisterStats } from '@/lib/register-data-db';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const stats = getRegisterStats();
  return NextResponse.json(stats);
});
