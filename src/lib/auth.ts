// src/lib/auth.ts — Session utilities for server-side API routes.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/services/auth/auth-config';
import type { Role } from '@/lib/enums';

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    customerId?: string;
  };
}

export async function getSession(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = (session.user as any).role as Role;
  if (!role) return null;
  return {
    user: {
      id: (session.user as any).id as string,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      role,
      customerId: (session.user as any).customerId as string | undefined,
    },
  };
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError('You must sign in to perform this action.');
  }
  return session;
}

export async function requireRole(
  ...allowed: Role[]
): Promise<AuthSession> {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    throw new ForbiddenError(
      `This action requires one of: ${allowed.join(', ')}.`,
    );
  }
  return session;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
