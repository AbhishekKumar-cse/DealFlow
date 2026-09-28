// src/app/api/quotes/[id]/confirm/route.ts — Confirm an approved quote.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { confirmQuote } from '@/application/quotation/quotation-service';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const updated = await confirmQuote(session.user, id);
    return NextResponse.json(updated);
  })();
}
