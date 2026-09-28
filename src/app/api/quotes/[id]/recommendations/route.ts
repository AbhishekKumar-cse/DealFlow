// src/app/api/quotes/[id]/recommendations/route.ts — List the latest
// batch of recommendation snapshots persisted for this quote.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listRecommendationsForQuote } from '@/application/recommendation/recommendation-service';
import { db } from '@/lib/db';

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

    // Customer role: only their own organization's quotes.
    if (session.user.role === 'CUSTOMER') {
      const quote = await db.quote.findUnique({
        where: { id },
        select: { customerId: true },
      });
      if (!quote || quote.customerId !== session.user.customerId) {
        throw new ForbiddenError('You can only view recommendations on your own quotes.');
      }
    }

    const data = await listRecommendationsForQuote(id);
    return NextResponse.json({ data });
  })();
}
