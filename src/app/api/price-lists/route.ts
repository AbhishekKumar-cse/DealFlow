// src/app/api/price-lists/route.ts — Price list list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreatePriceListSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const lists = await db.priceList.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(lists);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreatePriceListSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  // If isDefault, unset other defaults first.
  if (parsed.data.isDefault) {
    await db.priceList.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }
  const priceList = await db.priceList.create({ data: parsed.data });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'priceList',
    entityId: priceList.id,
    action: 'priceList.create',
    newValue: { name: priceList.name, isDefault: priceList.isDefault },
  });
  return NextResponse.json(priceList, { status: 201 });
});
