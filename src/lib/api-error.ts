// src/lib/api-error.ts — Standardized API error handling.

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth';

export class ValidationError extends Error {
  status = 422;
  constructor(public fields: ZodError['issues'], message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  status = 409;
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export function handleError(error: unknown): NextResponse {
  console.error('[api-error]', error);
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, fields: error.fields },
      { status: 422 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', fields: error.issues },
      { status: 422 },
    );
  }
  const msg = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** Wrap a route handler with structured error handling. */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (err) {
      return handleError(err);
    }
  }) as T;
}
