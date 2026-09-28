// src/app/api/quotes/[id]/lines/route.ts — Add a line to a quote.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { addLine } from '@/application/quotation/quotation-service';

const AddLineSchema = z.object({
  productId: z.string(),
  qty: z.number().int().min(1).max(10000),
  discountPercent: z.number().int().min(0).max(100).default(0),
  unitPriceCents: z.number().int().min(0).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = AddLineSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const line = await addLine(session.user, id, parsed.data);
    return NextResponse.json(line, { status: 201 });
  })();
}
