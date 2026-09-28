// src/app/api/subscriptions/[id]/cancel/route.ts — Cancel a subscription.
//
// RBAC: FINANCE_OPERATIONS + ADMIN + SALES_MANAGER. Body: { reason }.
// The service marks the subscription CANCELLED with `cancelledAt` and
// `endDate` (set to nextBillingDate so the customer keeps service
// through the end of the current cycle). Emits
// `billing.subscription.cancel` audit event.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { cancelSubscription } from '@/application/billing/billing-service';

const CancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'FINANCE_OPERATIONS',
      'ADMIN',
      'SALES_MANAGER',
    );
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = CancelSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const updated = await cancelSubscription(id, parsed.data.reason, session.user);
    return NextResponse.json(updated);
  })();
}
