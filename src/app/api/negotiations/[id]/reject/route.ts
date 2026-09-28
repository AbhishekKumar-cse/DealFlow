// src/app/api/negotiations/[id]/reject/route.ts — Manager rejects a proposal.
//
// RBAC: SALES_MANAGER, FINANCE_OPERATIONS, ADMIN. The service layer marks
// the NegotiationRequest as REJECTED and persists the rejection reason as a
// customer-visible comment.

import { NextResponse } from 'next/server';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { requireRole } from '@/lib/auth';
import { RejectProposalSchema } from '@/lib/schemas/negotiation';
import { rejectProposal } from '@/application/negotiation/negotiation-service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = RejectProposalSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await rejectProposal(id, session.user, { reason: parsed.data.reason });
    return NextResponse.json({ data: result });
  })();
}
