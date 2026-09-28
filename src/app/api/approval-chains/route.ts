// src/app/api/approval-chains/route.ts — Approval chains list + create (with steps).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreateApprovalChainSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const chains = await db.approvalChain.findMany({
    where: { active: true },
    orderBy: { triggerBand: 'asc' },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  return NextResponse.json(chains);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('ADMIN', 'SALES_MANAGER');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateApprovalChainSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { steps, ...chainData } = parsed.data;

  const chain = await db.approvalChain.create({
    data: {
      ...chainData,
      steps: steps.length
        ? { create: steps.map(({ order, requiredRole, approverId }) => ({
            order,
            requiredRole,
            approverId: approverId ?? null,
          })) }
        : undefined,
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'approvalChain',
    entityId: chain.id,
    action: 'approvalChain.create',
    newValue: { name: chain.name, triggerBand: chain.triggerBand, steps: chain.steps.length },
  });
  return NextResponse.json(chain, { status: 201 });
});
