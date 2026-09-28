// src/app/api/quotes/[id]/recommendations/add/route.ts — Add a
// recommended product as a new quote line at qty (default 1) and discount 0.
//
// RBAC: SALES_REP / SALES_MANAGER / ADMIN. The underlying `addLine`
// enforces quote-state (must be editable: DRAFT or RETURNED) and
// ownership for sales reps.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { addRecommendationToQuote } from '@/application/recommendation/recommendation-service';

const AddSchema = z.object({
  productId: z.string(),
  qty: z.number().int().min(1).max(10000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = AddSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await addRecommendationToQuote(
      id,
      parsed.data.productId,
      session.user,
      parsed.data.qty ?? 1,
    );
    return NextResponse.json(result, { status: 201 });
  })();
}
