// src/app/api/health/run/route.ts — Run health check.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import {
  runHealthCheck,
  runHealthCheckForAllOpenQuotes,
} from '@/application/deal-health/health-service';

const Body = z.object({ quoteId: z.string().optional() }).optional();

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  if (parsed.data?.quoteId) {
    const result = await runHealthCheck(parsed.data.quoteId, session.user);
    return NextResponse.json(result);
  }
  const result = await runHealthCheckForAllOpenQuotes();
  return NextResponse.json(result);
});
