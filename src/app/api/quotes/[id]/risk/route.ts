// src/app/api/quotes/[id]/risk/route.ts — Preview/refresh a quote's risk.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { evaluateQuoteRisk } from '@/application/risk/risk-service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'CUSTOMER', 'ADMIN');
    const { id } = await params;
    const result = await evaluateQuoteRisk(id);
    return NextResponse.json(result);
  })();
}

/** POST = force a re-evaluation (e.g. after config changes). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const result = await evaluateQuoteRisk(id);
    return NextResponse.json(result);
  })();
}
