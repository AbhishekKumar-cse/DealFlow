// src/app/api/subscription-plans/route.ts — Subscription plan list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreateSubscriptionPlanSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const plans = await db.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { interval: 'asc' },
  });
  return NextResponse.json(plans);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateSubscriptionPlanSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const plan = await db.subscriptionPlan.create({ data: parsed.data });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'subscriptionPlan',
    entityId: plan.id,
    action: 'subscriptionPlan.create',
    newValue: { name: plan.name, interval: plan.interval, priceCents: plan.priceCents },
  });
  return NextResponse.json(plan, { status: 201 });
});
