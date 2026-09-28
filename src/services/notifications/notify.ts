// src/services/notifications/notify.ts — Helper to create notifications.

import { db } from '@/lib/db';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Create a notification for a user. Silently fails (never blocks workflow). */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        read: false,
      },
    });
  } catch (err) {
    console.error('[notify] failed', input.type, err);
  }
}

/** Notify all users with a given role (e.g. all managers on a new pending approval). */
export async function notifyRole(
  role: string,
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: { active: true, role },
      select: { id: true },
    });
    for (const u of users) {
      await notify({ ...input, userId: u.id });
    }
  } catch (err) {
    console.error('[notifyRole] failed', role, err);
  }
}
