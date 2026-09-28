// src/app/api/registrations/[id]/route.ts — Get single registration detail.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, NotFoundError } from '@/lib/api-error';
import { getLogicDetailsDb } from '@/lib/logic-details-db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const db = getLogicDetailsDb();
    const row = db.prepare('SELECT * FROM RegistrationDetails WHERE id = ? LIMIT 1').get(id) as any;
    if (!row) throw new NotFoundError('Registration not found');
    return NextResponse.json({ data: row });
  })();
}
