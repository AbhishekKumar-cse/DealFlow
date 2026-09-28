// src/app/api/quotes/route.ts — Quote list + create.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler, ValidationError, NotFoundError } from '@/lib/api-error';
import {
  createQuote,
  listQuotes,
} from '@/application/quotation/quotation-service';

const CreateSchema = z.object({
  customerId: z.string(),
  priceListId: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
  expectedDeliveryDate: z.string().optional(),
});

export const GET = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'CUSTOMER', 'ADMIN');
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const customerId = url.searchParams.get('customerId') ?? undefined;
  if (session.user.role === 'CUSTOMER' && customerId && customerId !== session.user.customerId) {
    throw new ForbiddenError('You can only view your own organization.');
  }
  const result = await listQuotes(
    session.user,
    { page, pageSize, status, search, customerId },
  );
  return NextResponse.json(result);
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
  const json = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const quote = await createQuote(session.user, parsed.data);
  return NextResponse.json(quote, { status: 201 });
});
