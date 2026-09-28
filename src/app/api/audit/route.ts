// src/app/api/audit/route.ts — Immutable audit trail list.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 200);
  const action = url.searchParams.get('action') ?? undefined;
  const entityType = url.searchParams.get('entityType') ?? undefined;
  const actorId = url.searchParams.get('actorId') ?? undefined;
  const quoteId = url.searchParams.get('quoteId') ?? undefined;

  const where: any = {};
  if (action) where.action = { contains: action };
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (quoteId) where.quoteId = quoteId;

  const [total, data] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
