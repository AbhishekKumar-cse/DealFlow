// src/app/api/health/events/[id]/ack/route.ts

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, NotFoundError } from '@/lib/api-error';
import { acknowledgeEvent } from '@/application/deal-health/health-service';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const event = await acknowledgeEvent(id, session.user);
    if (!event) throw new NotFoundError('Event not found');
    return NextResponse.json(event);
  })();
}
