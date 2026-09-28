// src/app/api/approvals/route.ts — Approval queue for the signed-in user.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getApprovalQueueForUser } from '@/application/approval/approval-service';

export const GET = withErrorHandler(async () => {
  const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const queue = await getApprovalQueueForUser(session.user);
  return NextResponse.json({ data: queue });
});
