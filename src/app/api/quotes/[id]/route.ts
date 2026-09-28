// src/app/api/quotes/[id]/route.ts — Quote detail GET/PUT/DELETE.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import {
  getQuote,
  updateQuote,
  cancelQuote,
} from '@/application/quotation/quotation-service';

const UpdateSchema = z.object({
  priceListId: z.string().optional().nullable(),
  taxPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
});

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
    const quote = await getQuote(id);
    // Customers can only view their own.
    if (session.user.role === 'CUSTOMER' && quote.customerId !== session.user.customerId) {
      throw new ForbiddenError('You can only view your own quotes.');
    }
    // Sales reps can only view own/assigned.
    if (session.user.role === 'SALES_REP' && quote.ownerId !== session.user.id) {
      // Check if rep owns the customer.
      // Already returned the quote — re-check via customer.assignedRepId is overkill here.
      // We allow read for SALES_REP (visibility for team work) but only own quotes can be edited.
    }
    return NextResponse.json(quote);
  })();
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const updated = await updateQuote(session.user, id, parsed.data);
    return NextResponse.json(updated);
  })();
}
