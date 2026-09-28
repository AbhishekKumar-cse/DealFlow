// src/app/api/warehouses/route.ts — Warehouse list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreateWarehouseSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const warehouses = await db.warehouse.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { stock: true } } },
  });
  return NextResponse.json(warehouses);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateWarehouseSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const warehouse = await db.warehouse.create({ data: parsed.data });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'warehouse',
    entityId: warehouse.id,
    action: 'warehouse.create',
    newValue: { name: warehouse.name, code: warehouse.code },
  });
  return NextResponse.json(warehouse, { status: 201 });
});
