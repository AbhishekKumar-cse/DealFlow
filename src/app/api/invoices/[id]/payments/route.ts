// src/app/api/invoices/[id]/payments/route.ts — Record a payment
// against an invoice.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. Body: { amountCents, method?,
// reference? }. The service inserts a Payment row (status=COMPLETED,
// method defaults to SIMULATED), updates the invoice's paidCents and
// status (PAID if paidCents ≥ totalCents, else PARTIAL), and emits the
// `billing.payment.record` audit event.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { recordPayment } from '@/application/billing/billing-service';

const PaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z
    .enum(['SIMULATED', 'BANK_TRANSFER', 'CARD', 'WIRE'])
    .default('SIMULATED'),
  reference: z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = PaymentSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const invoice = await recordPayment(
      id,
      parsed.data.amountCents,
      parsed.data.method,
      parsed.data.reference,
      session.user,
    );
    return NextResponse.json(invoice);
  })();
}
