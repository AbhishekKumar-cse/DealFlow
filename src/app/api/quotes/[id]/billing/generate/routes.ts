// src/app/api/quotes/[id]/billing/generate/route.ts — Generate
// invoices + subscriptions for a CONFIRMED quote.
//
// RBAC: FINANCE_OPERATIONS + ADMIN + SALES_MANAGER. The service throws
// ConflictError if the quote is not CONFIRMED.
//
// For each QuoteLine:
//   - ONE_TIME  → standalone Invoice (type=ONE_TIME, ISSUED).
//   - RECURRING → Subscription + first-cycle recurring Invoice.
// After all invoices are created, the quote status is moved to FULFILLING.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { generateInvoicesForQuote } from '@/application/billing/billing-service';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'FINANCE_OPERATIONS',
      'ADMIN',
      'SALES_MANAGER',
    );
    const { id } = await params;
    const result = await generateInvoicesForQuote(id, session.user);
    return NextResponse.json(result, { status: 201 });
  })();
}
