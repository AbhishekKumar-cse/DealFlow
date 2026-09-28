// src/app/api/dashboard/metrics/route.ts — Live Executive Dashboard metrics.
//
// Returns the role-scoped KPIs + chart datasets for the dashboard view.
// Any authenticated role may call this; the service layer scopes the
// numbers to what the actor may see (CUSTOMER → own organization only;
// SALES_REP → own quotes + assigned customers; MANAGER/FINANCE/ADMIN → all).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getDashboardMetrics } from '@/application/dashboard/dashboard-service';

export const GET = withErrorHandler(async () => {
  const session = await requireRole(
    'SALES_REP',
    'SALES_MANAGER',
    'FINANCE_OPERATIONS',
    'CUSTOMER',
    'ADMIN',
  );
  const metrics = await getDashboardMetrics(session.user);
  return NextResponse.json(metrics);
});
