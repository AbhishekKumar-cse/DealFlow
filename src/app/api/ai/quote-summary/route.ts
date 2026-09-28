// src/app/api/ai/quote-summary/route.ts — AI deal summary.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { summarizeDeal } from '@/services/ai/insights';

const Body = z.object({ quoteId: z.string() });

export const POST = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const result = await summarizeDeal(parsed.data.quoteId);
  return NextResponse.json(result);
});