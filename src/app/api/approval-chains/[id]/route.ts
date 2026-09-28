// src/app/api/approval-chains/[id]/route.ts — Approval chain GET/DELETE.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, NotFoundError } from '@/lib/api-error';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const chain = await db.approvalChain.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!chain) throw new NotFoundError('Approval chain not found');
    return NextResponse.json(chain);
  })();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('ADMIN');
    const { id } = await params;
    await db.approvalChain.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  })();
}
