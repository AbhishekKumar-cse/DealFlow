// src/app/api/discount-rules/[id]/route.ts — Discount rule PUT/DELETE.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import { UpdateDiscountRuleSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const existing = await db.discountRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Discount rule not found');

    const json = await req.json().catch(() => ({}));
    const parsed = UpdateDiscountRuleSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const updated = await db.discountRule.update({
      where: { id },
      data: parsed.data,
      include: { category: true, product: true },
    });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'discountRule',
      entityId: id,
      action: 'discountRule.update',
      oldValue: { name: existing.name, maxPercent: existing.maxPercent },
      newValue: { name: updated.name, maxPercent: updated.maxPercent },
    });
    return NextResponse.json(updated);
  })();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('ADMIN', 'SALES_MANAGER');
    const { id } = await params;
    await db.discountRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  })();
}
