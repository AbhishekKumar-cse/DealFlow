// src/app/api/negotiations/route.ts — Paginated list of NegotiationRequests.
//
// RBAC reflection (server-side scoping in the service layer):
//   - CUSTOMER  → only their own organization's negotiations.
//   - SALES_REP → negotiations for quotes they own or that belong to their
//                 assigned customers.
//   - MANAGER / FINANCE / ADMIN → all.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listNegotiations } from '@/application/negotiation/negotiation-service';

export const GET = withErrorHandler(async (req) => {
  const session = await requireRole(
    'SALES_REP',
    'SALES_MANAGER',
    'FINANCE_OPERATIONS',
    'CUSTOMER',
    'ADMIN',
  );
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const status = url.searchParams.get('status') ?? undefined;
  const quoteId = url.searchParams.get('quoteId') ?? undefined;
  const result = await listNegotiations(session.user, { page, pageSize, status, quoteId });
  return NextResponse.json(result);
});
