// src/app/api/price-lists/[id]/items/route.ts — Price list items list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import { CreatePriceListItemSchema } from '@/lib/schemas/master-data';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const items = await db.priceListItem.findMany({
      where: { priceListId: id },
      include: { product: true },
    });
    return NextResponse.json(items);
  })();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    const list = await db.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundError('Price list not found');

    const json = await req.json().catch(() => ({}));
    const body = { ...json, priceListId: id };
    const parsed = CreatePriceListItemSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    // Upsert — unique (priceListId, productId)
    const item = await db.priceListItem.upsert({
      where: {
        priceListId_productId: {
          priceListId: id,
          productId: parsed.data.productId,
        },
      },
      create: parsed.data,
      update: { unitPriceCents: parsed.data.unitPriceCents, active: parsed.data.active },
    });
    return NextResponse.json(item, { status: 201 });
  })();
}
