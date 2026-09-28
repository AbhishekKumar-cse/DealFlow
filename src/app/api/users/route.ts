// src/app/api/users/route.ts — User list (for rep dropdowns).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const role = url.searchParams.get('role') ?? undefined;

  const users = await db.user.findMany({
    where: { active: true, role: role ?? undefined },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ data: users });
});
