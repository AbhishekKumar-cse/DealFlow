// src/app/api/fulfillment/route.ts — Paginated list of all
// FulfillmentOrders across all quotes.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. (Other roles use the per-quote
// GET /api/quotes/[id]/fulfillment route.)

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listFulfillmentOrders } from '@/application/fulfillment/fulfillment-service';

export const GET = withErrorHandler(async (req) => {
  await requireRole('FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const result = await listFulfillmentOrders({ page, pageSize, status, search });
  return NextResponse.json(result);
});
