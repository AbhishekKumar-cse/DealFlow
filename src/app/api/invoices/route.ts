// src/app/api/invoices/route.ts — Paginated list of all invoices across
// all customers.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. CUSTOMER is restricted to their own
// organization's invoices via the `customerId` query param (which is
// forced to their own id when they don't provide one).
//
// Filters (all optional): `customerId`, `status`, `type`, `search`.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listInvoices } from '@/application/billing/billing-service';

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
  const type = url.searchParams.get('type') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  // CUSTOMER scope guard.
  if (session.user.role === 'CUSTOMER') {
    if (!session.user.customerId) {
      throw new ForbiddenError('Your account is not linked to a customer organization.');
    }
    if (customerId && customerId !== session.user.customerId) {
      throw new ForbiddenError('You can only view your own invoices.');
    }
  }

  const result = await listInvoices({
    page,
    pageSize,
    customerId: session.user.role === 'CUSTOMER' ? session.user.customerId : customerId,
    status,
    type,
    search,
  });
  return NextResponse.json(result);
});
