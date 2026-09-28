// src/app/api/quotes/[id]/fulfillment/route.ts — Run fulfillment for a
// confirmed quote (POST) and fetch the latest FulfillmentOrder for a
// quote (GET).
//
// RBAC:
//   GET  — any authenticated role. CUSTOMER is restricted to their own
//          organization's quotes (the service layer returns the order
//          regardless; the route guards customer visibility).
//   POST — FINANCE_OPERATIONS + ADMIN + SALES_MANAGER. SALES_REP and
//          CUSTOMER cannot trigger fulfillment.

import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { db } from '@/lib/db';
import {
  runFulfillment,
  getFulfillmentForQuote,
} from '@/application/fulfillment/fulfillment-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'SALES_REP',
      'SALES_MANAGER',
      'FINANCE_OPERATIONS',
      'CUSTOMER',
      'ADMIN',
    );
    const { id } = await params;
    // Customer role: restrict to their own organization's quotes.
    if (session.user.role === 'CUSTOMER') {
      const quote = await db.quote.findUnique({
        where: { id },
        select: { customerId: true },
      });
      if (!quote || quote.customerId !== session.user.customerId) {
        throw new ForbiddenError('You can only view fulfillment for your own quotes.');
      }
    }
    const order = await getFulfillmentForQuote(id);
    return NextResponse.json({ data: order });
  })();
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole(
      'FINANCE_OPERATIONS',
      'ADMIN',
      'SALES_MANAGER',
    );
    const { id } = await params;
    const order = await runFulfillment(id, session.user);
    return NextResponse.json(order, { status: 201 });
  })();
}
