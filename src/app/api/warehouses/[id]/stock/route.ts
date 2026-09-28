// src/app/api/warehouses/[id]/stock/route.ts — Warehouse stock GET/PUT.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import { UpdateStockSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const stock = await db.warehouseStock.findMany({
      where: { warehouseId: id },
      include: { product: true },
    });
    return NextResponse.json(stock);
  })();
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const warehouse = await db.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundError('Warehouse not found');

    const json = await req.json().catch(() => ({}));
    const parsed = UpdateStockSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const existing = await db.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId: id, productId: parsed.data.productId } },
    });
    const oldValue = existing?.quantity ?? 0;

    const stock = await db.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: id, productId: parsed.data.productId } },
      create: { warehouseId: id, productId: parsed.data.productId, quantity: parsed.data.quantity },
      update: { quantity: parsed.data.quantity },
    });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'warehouse.stock',
      entityId: stock.id,
      action: 'warehouse.stock.update',
      oldValue: { qty: oldValue },
      newValue: { qty: stock.quantity },
      reason: 'manual adjustment',
    });
    return NextResponse.json(stock);
  })();
}
