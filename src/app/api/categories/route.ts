// src/app/api/categories/route.ts — Category list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { CreateCategorySchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const categories = await db.productCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json(categories);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateCategorySchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const category = await db.productCategory.create({ data: parsed.data });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'category',
    entityId: category.id,
    action: 'category.create',
    newValue: { name: category.name },
  });
  return NextResponse.json(category, { status: 201 });
});
