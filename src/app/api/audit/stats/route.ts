// src/app/api/audit/stats/route.ts — Audit trail stats (entity/action breakdown).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const since = url.searchParams.get('since')
    ? new Date(url.searchParams.get('since') as string)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count by entityType.
  const byEntityType = await db.auditEvent.groupBy({
    by: ['entityType'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { entityType: 'desc' } },
  });

  // Count by action (top 20).
  const byAction = await db.auditEvent.groupBy({
    by: ['action'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { action: 'desc' } },
    take: 20,
  });

  // Count by actor (top 10).
  const byActor = await db.auditEvent.groupBy({
    by: ['actorId', 'actorName', 'actorRole'],
    where: { createdAt: { gte: since }, actorId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { actorId: 'desc' } },
    take: 10,
  });

  return NextResponse.json({
    since: since.toISOString(),
    byEntityType: byEntityType.map((e) => ({ type: e.entityType, count: e._count._all })),
    byAction: byAction.map((a) => ({ action: a.action, count: a._count._all })),
    byActor: byActor.map((a) => ({
      actorId: a.actorId,
      actorName: a.actorName,
      actorRole: a.actorRole,
      count: a._count._all,
    })),
  });
});
