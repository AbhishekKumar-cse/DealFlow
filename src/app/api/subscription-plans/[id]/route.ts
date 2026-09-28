// src/app/api/subscription-plans/[id]/route.ts — Subscription plan PUT/DELETE.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, NotFoundError, ValidationError } from '@/lib/api-error';
import { CreateSubscriptionPlanSchema } from '@/lib/schemas/master-data';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const existing = await db.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Plan not found');

    const json = await req.json().catch(() => ({}));
    const parsed = CreateSubscriptionPlanSchema.partial().safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const updated = await db.subscriptionPlan.update({ where: { id }, data: parsed.data });
    return NextResponse.json(updated);
  })();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('ADMIN');
    const { id } = await params;
    await db.subscriptionPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  })();
}
