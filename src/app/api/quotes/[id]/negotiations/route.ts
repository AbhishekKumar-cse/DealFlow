// src/app/api/quotes/[id]/negotiations/route.ts — Customer submits a
// proposal against this quote.
//
// RBAC: CUSTOMER only. The service layer enforces that the quote belongs
// to the customer's organization AND that the quote is in a negotiable
// status (SUBMITTED / PENDING_MANAGER / PENDING_FINANCE / APPROVED).
//
// GET (any authenticated role) returns the list of negotiations for this
// quote, role-scoped server-side (CUSTOMER sees only their own org's;
// SALES_REP sees quotes they own or that belong to assigned customers;
// MANAGER / FINANCE / ADMIN see all).

import { NextResponse } from 'next/server';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { requireRole } from '@/lib/auth';
import { SubmitProposalSchema } from '@/lib/schemas/negotiation';
import {
  submitProposal,
  listNegotiationsForQuote,
} from '@/application/negotiation/negotiation-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'SALES_REP',
      'SALES_MANAGER',
      'FINANCE_OPERATIONS',
      'CUSTOMER',
      'ADMIN',
    );
    const { id } = await params;
    const data = await listNegotiationsForQuote(id, session.user);
    return NextResponse.json({ data });
  })();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('CUSTOMER');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = SubmitProposalSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await submitProposal(id, session.user, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  })();
}
