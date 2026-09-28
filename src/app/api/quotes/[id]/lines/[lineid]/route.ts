// src/app/api/quotes/[id]/lines/[lineId]/route.ts — Update/remove a line.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import {
  updateLine,
  removeLine,
} from '@/application/quotation/quotation-service';

const PatchSchema = z.object({
  productId: z.string().optional(),
  qty: z.number().int().min(1).max(10000).optional(),
  discountPercent: z.number().int().min(0).max(100).optional(),
  unitPriceCents: z.number().int().min(0).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id, lineId } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const updated = await updateLine(session.user, id, lineId, parsed.data);
    return NextResponse.json(updated);
  })();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id, lineId } = await params;
    await removeLine(session.user, id, lineId);
    return NextResponse.json({ ok: true });
  })();
}
