// src/app/api/customers/[id]/route.ts — Customer GET/PUT/DELETE.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import {
  withErrorHandler,
  ValidationError,
  NotFoundError,
} from '@/lib/api-error';
import { UpdateCustomerSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(
      'SALES_REP',
      'SALES_MANAGER',
      'FINANCE_OPERATIONS',
      'CUSTOMER',
      'ADMIN',
    );
    const { id } = await params;
    // Customer users can only read their own organization.
    if (session.user.role === 'CUSTOMER' && session.user.customerId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Sales reps can only read assigned customers.
    if (session.user.role === 'SALES_REP') {
      const customer = await db.customer.findUnique({ where: { id } });
      if (!customer || customer.assignedRepId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json(customer);
    }
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        contacts: true,
        assignedRep: { select: { id: true, name: true, email: true } },
        _count: { select: { quotes: true, users: true } },
      },
    });
    if (!customer) throw new NotFoundError('Customer not found');
    return NextResponse.json(customer);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'ADMIN', 'FINANCE_OPERATIONS');
    const { id } = await params;
    const existing = await db.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Customer not found');

    const json = await req.json().catch(() => ({}));
    const parsed = UpdateCustomerSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    const updated = await db.customer.update({
      where: { id },
      data: parsed.data,
    });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'customer',
      entityId: id,
      action: 'customer.update',
      oldValue: { name: existing.name, tier: existing.tier },
      newValue: { name: updated.name, tier: updated.tier },
    });
    return NextResponse.json(updated);
  })();
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('ADMIN');
    const { id } = await params;
    const existing = await db.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Customer not found');
    // Soft-delete: mark inactive rather than hard delete to preserve history.
    const updated = await db.customer.update({
      where: { id },
      data: { active: false },
    });
    await audit({
      actorId: session.user.id,
      actorRole: session.user.role,
      actorName: session.user.name,
      entityType: 'customer',
      entityId: id,
      action: 'customer.deactivate',
      oldValue: { name: existing.name },
      newValue: { name: updated.name, active: false },
    });
    return NextResponse.json({ ok: true });
  })();
}
