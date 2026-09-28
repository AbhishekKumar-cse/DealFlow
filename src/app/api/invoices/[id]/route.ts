// src/app/api/invoices/[id]/route.ts — Get a single invoice with its
// lines, payments, and credit notes.
//
// RBAC: FINANCE_OPERATIONS + ADMIN + CUSTOMER (restricted to own).

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getInvoice } from '@/application/billing/billing-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'FINANCE_OPERATIONS',
      'ADMIN',
      'CUSTOMER',
    );
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (
      session.user.role === 'CUSTOMER' &&
      invoice.customerId !== session.user.customerId
    ) {
      throw new ForbiddenError('You can only view your own invoices.');
    }
    return NextResponse.json(invoice);
  })();
}
