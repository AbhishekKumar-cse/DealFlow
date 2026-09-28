// src/app/api/subscriptions/route.ts — Paginated list of subscriptions.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. CUSTOMER is restricted to their own
// organization's subscriptions.
//
// Defaults to ACTIVE only when no `status` filter is provided.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listSubscriptions } from '@/application/billing/billing-service';

export const GET = withErrorHandler(async (req) => {
  const session = await requireRole(
    'FINANCE_OPERATIONS',
    'ADMIN',
    'CUSTOMER',
  );
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const customerId = url.searchParams.get('customerId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  // CUSTOMER scope guard.
  if (session.user.role === 'CUSTOMER') {
    if (!session.user.customerId) {
      throw new ForbiddenError('Your account is not linked to a customer organization.');
    }
    if (customerId && customerId !== session.user.customerId) {
      throw new ForbiddenError('You can only view your own subscriptions.');
    }
  }

  const result = await listSubscriptions({
    page,
    pageSize,
    customerId:
      session.user.role === 'CUSTOMER' ? session.user.customerId : customerId,
    status,
    search,
  });
  return NextResponse.json(result);
});
