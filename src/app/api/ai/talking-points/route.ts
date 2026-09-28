// src/app/api/ai/talking-points/route.ts — AI sales talking points.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { generateTalkingPoints } from '@/services/ai/insights';

const Body = z.object({ quoteId: z.string() });

export const POST = withErrorHandler(async (req) => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const result = await generateTalkingPoints(parsed.data.quoteId);
  return NextResponse.json(result);
});