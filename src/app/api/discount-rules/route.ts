// src/app/api/discount-rules/route.ts — Discount rules list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreateDiscountRuleSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const rules = await db.discountRule.findMany({
    orderBy: [{ priority: 'desc' }, { maxPercent: 'asc' }],
    include: {
      category: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true } },
    },
  });
  return NextResponse.json(rules);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateDiscountRuleSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const rule = await db.discountRule.create({
    data: parsed.data,
    include: { category: true, product: true },
  });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'discountRule',
    entityId: rule.id,
    action: 'discountRule.create',
    newValue: { name: rule.name, maxPercent: rule.maxPercent },
  });
  return NextResponse.json(rule, { status: 201 });
});
