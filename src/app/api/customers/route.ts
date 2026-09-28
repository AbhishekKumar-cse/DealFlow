// src/app/api/customers/route.ts — Customer list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import {
  CreateCustomerSchema,
  PaginationSchema,
} from '@/lib/schemas/master-data';
import { paginate, pageBounds, nameSearch } from '@/lib/pagination';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const url = new URL(req.url);
  const params = PaginationSchema.parse(Object.fromEntries(url.searchParams));
  // Sales reps only see customers assigned to them.
  const assignedRepFilter =
    session.user.role === 'SALES_REP' ? { assignedRepId: session.user.id } : {};

  const [total, data] = await Promise.all([
    db.customer.count({ where: { ...assignedRepFilter, name: nameSearch(params.search) } }),
    db.customer.findMany({
      where: { ...assignedRepFilter, name: nameSearch(params.search) },
      ...pageBounds(params),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { quotes: true, contacts: true } } },
    }),
  ]);

  return NextResponse.json(paginate(data, total, params));
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'ADMIN', 'FINANCE_OPERATIONS');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateCustomerSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const data = parsed.data;

  if (data.assignedRepId) {
    const rep = await db.user.findUnique({ where: { id: data.assignedRepId } });
    if (!rep) throw new NotFoundError('Assigned rep not found');
  }

  const customer = await db.customer.create({ data });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'customer',
    entityId: customer.id,
    action: 'customer.create',
    newValue: JSON.stringify({ name: customer.name, tier: customer.tier }),
  });

  return NextResponse.json(customer, { status: 201 });
});
