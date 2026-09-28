// src/app/api/register-data/route.ts — List registrations from the NEW
// register_data_db (3 tables: RegisterData, RegisterActivity, RegisterAuditLog).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { listRegisters } from '@/lib/register-data-db';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? '';
  const role = url.searchParams.get('role') ?? '';
  const status = url.searchParams.get('status') ?? '';

  const rows = listRegisters({
    search: search || undefined,
    role: role || undefined,
    status: status || undefined,
    limit: 500,
  });

  // Don't expose passwordHash in the response.
  const safe = rows.map((r) => {
    const { passwordHash, ...rest } = r;
    return rest;
  });

  return NextResponse.json({ data: safe, count: safe.length });
});
