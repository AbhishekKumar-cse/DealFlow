// src/app/api/negotiations/[id]/comments/route.ts — Add a comment to a
// negotiation thread.
//
// RBAC: any authenticated role. Internal-only comments are restricted to
// non-CUSTOMER roles (enforced in the service layer). The actor must have
// visibility of the negotiation (also enforced in the service layer via
// role scoping).

import { NextResponse } from 'next/server';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { requireRole } from '@/lib/auth';
import { AddCommentSchema } from '@/lib/schemas/negotiation';
import { addComment } from '@/application/negotiation/negotiation-service';

export async function POST(
  req: Request,
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
    const json = await req.json().catch(() => ({}));
    const parsed = AddCommentSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const comment = await addComment(id, session.user, parsed.data);
    return NextResponse.json({ data: comment }, { status: 201 });
  })();
}
