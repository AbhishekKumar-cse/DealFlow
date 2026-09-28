// src/domain/quotation/rules.ts — Quote state machine rules.
// Pure functions for allowed status transitions, edit permissions, etc.

import type { QuoteStatus } from '@/lib/enums';
import { InvalidStateTransitionError, EmptyQuoteError } from './errors';
import type { QuoteLineInput } from './entities';

/** Allowed status transitions. */
const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['PENDING_MANAGER', 'RETURNED', 'CANCELLED'],
  PENDING_MANAGER: ['PENDING_FINANCE', 'APPROVED', 'REJECTED', 'RETURNED'],
  PENDING_FINANCE: ['APPROVED', 'REJECTED', 'RETURNED'],
  APPROVED: ['CONFIRMED', 'CANCELLED'],
  RETURNED: ['DRAFT', 'SUBMITTED', 'CANCELLED'],
  CONFIRMED: ['FULFILLING', 'CANCELLED'],
  FULFILLING: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertCanTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/** Quote is editable (lines/discount/qty can change). */
export function isEditable(status: QuoteStatus): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

/** Quote can be submitted (draft → submitted requires ≥1 line). */
export function canSubmit(status: QuoteStatus, lines: QuoteLineInput[]): void {
  if (status !== 'DRAFT' && status !== 'RETURNED') {
    throw new InvalidStateTransitionError(status, 'SUBMITTED');
  }
  if (lines.length === 0) {
    throw new EmptyQuoteError();
  }
}

/** Quote can be confirmed (after approval). */
export function canConfirm(status: QuoteStatus): void {
  if (status !== 'APPROVED') {
    throw new InvalidStateTransitionError(status, 'CONFIRMED');
  }
}

/** Quote can be cancelled. */
export function canCancel(status: QuoteStatus): void {
  if (['FULFILLED', 'REJECTED', 'CANCELLED'].includes(status)) {
    throw new InvalidStateTransitionError(status, 'CANCELLED');
  }
}
