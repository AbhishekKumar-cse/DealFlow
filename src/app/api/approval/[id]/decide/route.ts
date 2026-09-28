// src/app/api/approvals/[id]/decide/route.ts — Approve/reject/return.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { decide } from '@/application/approval/approval-service';

const Body = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  comment: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await decide(session.user, id, parsed.data.decision, parsed.data.comment);
    return NextResponse.json(result);
  })();
}
