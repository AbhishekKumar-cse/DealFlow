// src/app/api/invoices/[id]/credit-notes/route.ts — Issue a credit
// note against an invoice.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. Body: { amountCents, reason }. The
// service generates a CN-2026-0001 style number, creates the
// CreditNote row, reduces the invoice's totalCents (and paidCents if
// needed), and emits the `billing.creditNote.issue` audit event.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { issueCreditNote } from '@/application/billing/billing-service';

const CreditNoteSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = CreditNoteSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const invoice = await issueCreditNote(
      id,
      parsed.data.amountCents,
      parsed.data.reason,
      session.user,
    );
    return NextResponse.json(invoice);
  })();
}
