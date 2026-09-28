// src/app/api/quotes/[id]/billing/route.ts — Get invoices + subscriptions
// for a quote (used by QuoteDetailView's Billing summary card).
//
// RBAC: any authenticated role; CUSTOMER is restricted to their own
// organization's quotes.
//
// Returns: { data: { invoices, subscriptions, summary } } where summary
// has { invoiceCount, totalInvoicedCents, totalPaidCents,
// recurringRevenueCents }.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { db } from '@/lib/db';
import { getBillingForQuote } from '@/application/billing/billing-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'SALES_REP',
      'SALES_MANAGER',
      'FINANCE_OPERATIONS',
      'CUSTOMER',
      'ADMIN',
    );
    const { id } = await params;

    // Customer role: restrict to their own organization's quotes.
    if (session.user.role === 'CUSTOMER') {
      const quote = await db.quote.findUnique({
        where: { id },
        select: { customerId: true },
      });
      if (!quote || quote.customerId !== session.user.customerId) {
        throw new ForbiddenError('You can only view billing for your own quotes.');
      }
    }

    const billing = await getBillingForQuote(id);
    return NextResponse.json({ data: billing });
  })();
}
