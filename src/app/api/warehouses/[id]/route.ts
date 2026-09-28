// src/app/api/warehouses/[id]/route.ts — Warehouse GET/PUT/DELETE.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import { CreateWarehouseSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const warehouse = await db.warehouse.findUnique({
      where: { id },
      include: {
        stock: { include: { product: true } },
      },
    });
    if (!warehouse) throw new NotFoundError('Warehouse not found');
    return NextResponse.json(warehouse);
  })();
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const existing = await db.warehouse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Warehouse not found');

    const json = await req.json().catch(() => ({}));
    const parsed = CreateWarehouseSchema.partial().safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const updated = await db.warehouse.update({ where: { id }, data: parsed.data });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'warehouse',
      entityId: id,
      action: 'warehouse.update',
      oldValue: { name: existing.name, shippingCostCents: existing.shippingCostCents },
      newValue: { name: updated.name, shippingCostCents: updated.shippingCostCents },
    });
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
    await db.warehouse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  })();
}
