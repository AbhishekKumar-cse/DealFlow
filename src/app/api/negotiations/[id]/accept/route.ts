// src/app/api/negotiations/[id]/accept/route.ts — Manager accepts a proposal.
//
// RBAC: SALES_MANAGER, FINANCE_OPERATIONS, ADMIN. The service layer applies
// the changes to the actual QuoteLine rows (bypassing the editable-state
// check because this is an authorized manager action), recomputes risk,
// and if the risk band escalated: invalidates the existing approval + re-
// routes to a new approval chain.

import { NextResponse } from 'next/server';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { requireRole } from '@/lib/auth';
import { AcceptProposalSchema } from '@/lib/schemas/negotiation';
import { acceptProposal } from '@/application/negotiation/negotiation-service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = AcceptProposalSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await acceptProposal(id, session.user, { comment: parsed.data.comment });
    return NextResponse.json({ data: result });
  })();
}
