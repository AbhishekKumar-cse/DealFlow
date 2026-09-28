// src/app/api/notifications/read-all/route.ts — Mark all as read.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';

export const POST = withErrorHandler(async () => {
  const session = await requireRole(
    'SALES_REP',
    'SALES_MANAGER',
    'FINANCE_OPERATIONS',
    'CUSTOMER',
    'ADMIN',
  );
  const result = await db.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });
  return NextResponse.json({ updated: result.count });
});
