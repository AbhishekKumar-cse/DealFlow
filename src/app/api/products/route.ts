// src/app/api/products/route.ts — Product list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import {
  withErrorHandler,
  ValidationError,
} from '@/lib/api-error';
import {
  CreateProductSchema,
  PaginationSchema,
} from '@/lib/schemas/master-data';
import { paginate, pageBounds, nameSearch } from '@/lib/pagination';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const params = PaginationSchema.parse(Object.fromEntries(url.searchParams));
  const categoryId = url.searchParams.get('categoryId') ?? undefined;
  const activeOnly = url.searchParams.get('active') !== 'false';

  const where = {
    name: nameSearch(params.search),
    categoryId,
    active: activeOnly ? true : undefined,
  };

  const [total, data] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      ...pageBounds(params),
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    }),
  ]);

  return NextResponse.json(paginate(data, total, params));
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateProductSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const data = parsed.data;

  const category = await db.productCategory.findUnique({ where: { id: data.categoryId } });
  if (!category) throw new ValidationError([{ code: 'custom', path: ['categoryId'], message: 'Category not found' }] as any);

  const product = await db.product.create({ data, include: { category: true } });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'product',
    entityId: product.id,
    action: 'product.create',
    newValue: { name: product.name, sku: product.sku, billingType: product.billingType },
  });
  return NextResponse.json(product, { status: 201 });
});
