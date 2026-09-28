// src/app/api/notifications/[id]/read/route.ts — Mark single as read.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler, NotFoundError } from '@/lib/api-error';

export async function POST(
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
    const notif = await db.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundError('Notification not found');
    if (notif.userId !== session.user.id) {
      throw new ForbiddenError('Cannot mark another user\'s notification.');
    }
    const updated = await db.notification.update({
      where: { id },
      data: { read: true },
    });
    return NextResponse.json(updated);
  })();
}
