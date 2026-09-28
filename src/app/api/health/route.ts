// src/app/api/health/route.ts — List events.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listHealthEvents } from '@/application/deal-health/health-service';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '50', 10);
  const status = url.searchParams.get('status') ?? undefined;
  const severity = url.searchParams.get('severity') ?? undefined;
  const quoteId = url.searchParams.get('quoteId') ?? undefined;
  const result = await listHealthEvents({ page, pageSize, status, severity, quoteId });
  return NextResponse.json(result);
});
