// src/domain/negotiation/types.ts — Pure-domain types for the customer
// negotiation flow (Phase 11).
//
// The customer can never mutate quote records directly. Each customer proposal
// creates a NegotiationRequest (status=OPEN) with one or more
// NegotiationChange rows. Each change records the would-be new risk score
// (simulated, not persisted on the quote) so the internal queue can show the
// manager whether accepting the proposal will escalate the risk band.
//
// If a proposal would escalate the risk band, the existing approval is
// invalidated (status=SUPERSEDED) and the quote is re-routed to a new
// approval chain based on the new band.

import type { RiskBand } from '@/lib/enums';

/** Fields a customer is allowed to propose a change on. */
export type NegotiationField = 'discountPercent' | 'qty';

/** A single requested change against a quote line. */
export interface NegotiationChangeInput {
  /** QuoteLine id this change targets. Required for line-level changes. */
  quoteLineId?: string;
  /** Field the customer wants to change. */
  field: NegotiationField;
  /** Current value (stringified — the application layer normalizes numbers). */
  oldValue: string;
  /** Proposed new value (stringified). */
  newValue: string;
}

/** Result returned to the customer after submitting a proposal. */
export interface NegotiationProposalResult {
  /** The new NegotiationRequest id. */
  requestId: string;
  /** NegotiationStatus — OPEN | ACCEPTED | REJECTED | SUPERSEDED. */
  status: string;
  /**
   * True if any change in this proposal would escalate the risk band (and
   * therefore invalidate the existing approval). Surfaced to the manager in
   * the internal queue; never shown directly to the customer.
   */
  invalidatesApproval: boolean;
  /** The simulated new risk score (worst case across all changes). Null if no changes. */
  newRiskScore: number | null;
  /** The simulated new risk band (worst case across all changes). Null if no changes. */
  newRiskBand: RiskBand | null;
  /**
   * Safe customer-facing message. The customer never sees internal margin,
   * risk details, or approval notes — only this string. Two values:
   *   - "Your proposed change requires additional approval." (when invalidatesApproval)
   *   - "Your proposal has been submitted. We'll review and respond shortly." (otherwise)
   */
  safeMessage: string;
}

/** Persisted shape of a single change row (used by the API layer). */
export interface NegotiationChangeRow {
  id: string;
  negotiationId: string;
  quoteLineId: string | null;
  field: NegotiationField;
  oldValue: string;
  newValue: string;
  newRiskScore: number | null;
  newRiskBand: RiskBand | null;
  invalidatesApproval: boolean;
  createdAt: string;
}

/** Persisted shape of a single comment row (used by the API layer). */
export interface NegotiationCommentRow {
  id: string;
  negotiationId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  /** Internal-only comments are never exposed to CUSTOMER role. */
  internal: boolean;
  createdAt: string;
}

/** Persisted shape of a NegotiationRequest (used by the API layer). */
export interface NegotiationRequestRow {
  id: string;
  quoteId: string;
  customerId: string;
  status: string;
  message: string | null;
  customerSafeMessage: string | null;
  invalidatesApproval: boolean;
  newRiskScore: number | null;
  newRiskBand: RiskBand | null;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  changes: NegotiationChangeRow[];
  comments: NegotiationCommentRow[];
  quote?: {
    id: string;
    number: string;
    status: string;
    customer: { id: string; name: string; tier: string };
    owner: { id: string; name: string };
  } | null;
}

/** The two safe customer-facing message templates. */
export const SAFE_MESSAGE_REQUIRES_APPROVAL =
  'Your proposed change requires additional approval.';
export const SAFE_MESSAGE_SUBMITTED =
  "Your proposal has been submitted. We'll review and respond shortly.";

/**
 * Risk band escalation check used by the negotiation service to decide
 * whether a proposed change invalidates the existing approval.
 *
 * Escalation order: SAFE (0) < REVIEW (1) < MANAGER (2) < FINANCE (3).
 * A change escalates the band if the new band's rank is strictly greater
 * than the old band's rank.
 */
export const RISK_BAND_RANK: Record<RiskBand, number> = {
  SAFE: 0,
  REVIEW: 1,
  MANAGER: 2,
  FINANCE: 3,
};

export function riskBandEscalates(
  oldBand: RiskBand | null | undefined,
  newBand: RiskBand | null | undefined,
): boolean {
  if (!oldBand || !newBand) return false;
  return RISK_BAND_RANK[newBand] > RISK_BAND_RANK[oldBand];
}

/** Quote statuses the customer is allowed to negotiate against. */
export const NEGOTIABLE_QUOTE_STATUSES = new Set([
  'SUBMITTED',
  'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED',
]);
