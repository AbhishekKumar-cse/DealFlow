// src/app/api/price-lists/[id]/route.ts — Price list GET/PUT/DELETE.

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
    const list = await db.priceList.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!list) throw new NotFoundError('Price list not found');
    return NextResponse.json(list);
  })();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    await db.priceList.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  })();
}
