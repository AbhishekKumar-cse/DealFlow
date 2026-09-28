// src/app/api/customers/[id]/contacts/route.ts — Contacts list + create.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import {
  withErrorHandler,
  ValidationError,
  NotFoundError,
} from '@/lib/api-error';
import { CreateContactSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole(
      'SALES_REP',
      'SALES_MANAGER',
      'FINANCE_OPERATIONS',
      'CUSTOMER',
      'ADMIN',
    );
    const { id } = await params;
    const contacts = await db.customerContact.findMany({
      where: { customerId: id },
      orderBy: [{ primary: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(contacts);
  })();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'ADMIN', 'FINANCE_OPERATIONS');
    const { id } = await params;
    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError('Customer not found');

    const json = await req.json().catch(() => ({}));
    const body = { ...json, customerId: id };
    const parsed = CreateContactSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const contact = await db.customerContact.create({ data: parsed.data });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'customer.contact',
      entityId: contact.id,
      quoteId: undefined,
      action: 'customer.contact.create',
      newValue: { name: contact.name, email: contact.email },
    });
    return NextResponse.json(contact, { status: 201 });
  })();
}
