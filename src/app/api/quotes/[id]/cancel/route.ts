// src/app/api/quotes/[id]/cancel/route.ts — Cancel a quote.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { cancelQuote } from '@/application/quotation/quotation-service';

const Body = z.object({ reason: z.string().max(500).optional() }).optional();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const updated = await cancelQuote(session.user, id, parsed.data?.reason);
    return NextResponse.json(updated);
  })();
}
