// src/app/api/quotes/[id]/submit/route.ts — Submit a quote for approval.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { submitQuote } from '@/application/quotation/quotation-service';

const Body = z.object({}).optional();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
    const { id } = await params;
    await Body.parseAsync(await req.json().catch(() => ({})));
    const updated = await submitQuote(session.user, id);
    return NextResponse.json(updated);
  })();
}
