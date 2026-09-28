// src/app/api/registrations/route.ts — List registration details from
// logic_details_db. All internal roles can read (admin/manager/finance/rep).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { getLogicDetailsDb } from '@/lib/logic-details-db';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? '';
  const roleFilter = url.searchParams.get('role') ?? '';
  const statusFilter = url.searchParams.get('status') ?? '';

  const db = getLogicDetailsDb();
  let sql = 'SELECT * FROM RegistrationDetails WHERE 1=1';
  const params: any[] = [];
  if (search) {
    sql += ' AND (lower(fullName) LIKE ? OR lower(email) LIKE ? OR lower(company) LIKE ?)';
    const q = '%' + search.toLowerCase() + '%';
    params.push(q, q, q);
  }
  if (roleFilter) {
    sql += ' AND role = ?';
    params.push(roleFilter);
  }
  if (statusFilter) {
    sql += ' AND status = ?';
    params.push(statusFilter);
  }
  sql += ' ORDER BY createdAt DESC LIMIT 500';

  const rows = db.prepare(sql).all(...params) as any[];
  return NextResponse.json({
    data: rows.map(normalize),
    count: rows.length,
  });
});

function normalize(r: any) {
  return {
    id: r.id,
    userId: r.userId,
    fullName: r.fullName,
    email: r.email,
    role: r.role,
    phone: r.phone,
    company: r.company,
    jobTitle: r.jobTitle,
    country: r.country,
    city: r.city,
    address: r.address,
    zipCode: r.zipCode,
    agreeToTerms: !!r.agreeToTerms,
    marketingOptIn: !!r.marketingOptIn,
    signupSource: r.signupSource,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    status: r.status,
    emailVerifiedAt: r.emailVerifiedAt,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
