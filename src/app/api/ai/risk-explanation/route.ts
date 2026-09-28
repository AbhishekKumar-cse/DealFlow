// src/app/api/ai/risk-explanation/route.ts — AI risk explanation.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { explainQuoteRisk } from '@/services/ai/insights';

const Body = z.object({ quoteId: z.string() });

export const POST = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const result = await explainQuoteRisk(parsed.data.quoteId);
  return NextResponse.json(result);
});