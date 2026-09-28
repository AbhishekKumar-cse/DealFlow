// src/app/api/notifications/route.ts — List + create notifications.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, ForbiddenError } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';

export const GET = withErrorHandler(async (req) => {
  const session = await requireRole(
    'SALES_REP',
    'SALES_MANAGER',
    'FINANCE_OPERATIONS',
    'CUSTOMER',
    'ADMIN',
  );
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const where: any = { userId: session.user.id };
  if (unreadOnly) where.read = false;

  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const unreadCount = await db.notification.count({
    where: { userId: session.user.id, read: false },
  });
  return NextResponse.json({ data: notifications, unreadCount });
});

const CreateBody = z.object({
  userId: z.string(),
  type: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  link: z.string().max(500).optional(),
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const notification = await db.notification.create({ data: parsed.data });
  return NextResponse.json(notification, { status: 201 });
});
