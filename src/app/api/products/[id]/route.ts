// src/app/api/products/[id]/route.ts — Product GET/PUT.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import { UpdateProductSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        priceListItems: { include: { priceList: true } },
        warehouseStock: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundError('Product not found');
    return NextResponse.json(product);
  })();
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product not found');

    const json = await req.json().catch(() => ({}));
    const parsed = UpdateProductSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const updated = await db.product.update({
      where: { id },
      data: parsed.data,
      include: { category: true },
    });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'product',
      entityId: id,
      action: 'product.update',
      oldValue: { name: existing.name, listPriceCents: existing.listPriceCents },
      newValue: { name: updated.name, listPriceCents: updated.listPriceCents },
    });
    return NextResponse.json(updated);
  })();
}
