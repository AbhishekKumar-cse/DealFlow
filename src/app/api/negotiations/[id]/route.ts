// src/app/api/negotiations/[id]/route.ts — Single negotiation with
// changes + comments.
//
// RBAC reflection (server-side scoping in the service layer):
//   - CUSTOMER  → only their own organization's negotiation; internal
//                 comments are filtered out.
//   - SALES_REP → only if they own the quote OR the customer is assigned
//                 to them.
//   - MANAGER / FINANCE / ADMIN → all; internal comments included.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getNegotiation } from '@/application/negotiation/negotiation-service';

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
    const data = await getNegotiation(id, session.user);
    return NextResponse.json({ data });
  })();
}
