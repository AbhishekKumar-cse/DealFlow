// src/app/api/quotes/[id]/approvals/route.ts — Approval timeline for a quote.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getApprovalTimeline } from '@/application/approval/approval-service';

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
    const timeline = await getApprovalTimeline(id);
    // Customers see only the decision outcomes, not internal comments.
    if (session.user.role === 'CUSTOMER') {
      const sanitized = timeline.map((r: any) => ({
        ...r,
        decisions: r.decisions.map((d: any) => ({
          decision: d.decision,
          step: d.step,
          createdAt: d.createdAt,
          approverName: d.approver?.name,
          comment: d.comment ? '[internal]' : null,
        })),
      }));
      return NextResponse.json({ data: sanitized });
    }
    return NextResponse.json({ data: timeline });
  })();
}
