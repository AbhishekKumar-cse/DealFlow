// src/app/api/quotes/[id]/recommendations/generate/route.ts — Generate
// a fresh batch of recommendations for a quote.
//
// RBAC: SALES_REP / SALES_MANAGER / ADMIN. Customers and finance cannot
// trigger generation (finance can still READ via the parent route).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { generateRecommendationsForQuote } from '@/application/recommendation/recommendation-service';

const GenerateSchema = z
  .object({
    limit: z.number().int().min(1).max(20).optional(),
    weights: z
      .object({
        wCo: z.number().min(0).max(100),
        wPromo: z.number().min(0).max(100),
        wMargin: z.number().min(0).max(100),
        wCat: z.number().min(0).max(100),
      })
      .optional(),
  })
  .optional();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = GenerateSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const data = await generateRecommendationsForQuote(id, session.user, parsed.data ?? {});
    return NextResponse.json({ data });
  })();
}
