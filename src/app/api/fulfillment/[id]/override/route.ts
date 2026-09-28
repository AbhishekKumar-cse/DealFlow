// src/app/api/fulfillment/[id]/override/route.ts — Manually reassign a
// single allocation line to a different warehouse.
//
// RBAC: FINANCE_OPERATIONS + ADMIN. The body must include a `reason`
// (audited) and a non-zero `newWarehouseId`. The order must not be in a
// terminal state (FULFILLED / CANCELLED).
//
// The new warehouse's stock is decremented inside a transaction; the
// old warehouse's stock is restored. The order's totals are recomputed
// from the resulting allocations.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { manualOverrideAllocation } from '@/application/fulfillment/fulfillment-service';

const OverrideSchema = z.object({
  allocationId: z.string().min(1),
  newWarehouseId: z.string().min(1),
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
    const parsed = OverrideSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const updated = await manualOverrideAllocation(
      id,
      parsed.data.allocationId,
      parsed.data.newWarehouseId,
      parsed.data.reason,
      session.user,
    );
    return NextResponse.json(updated);
  })();
}
