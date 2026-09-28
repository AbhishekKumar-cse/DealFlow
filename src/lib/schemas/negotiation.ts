// src/lib/schemas/negotiation.ts — Zod schemas for the negotiation API
// endpoints. Kept in `src/lib/schemas/` (the only place under `src/lib/` we
// are permitted to add new files for Phase 11).

import { z } from 'zod';

/** A single proposed change against a quote line. */
export const NegotiationChangeSchema = z.object({
  quoteLineId: z.string().min(1),
  /** Field the customer wants to change. */
  field: z.enum(['discountPercent', 'qty']),
  /** Proposed new value (integer percent for discountPercent; positive integer qty). */
  newValue: z.number().int().min(0),
});

/** Body for POST /api/quotes/[id]/negotiations — customer submits a proposal. */
export const SubmitProposalSchema = z.object({
  changes: z.array(NegotiationChangeSchema).min(1).max(50),
  message: z.string().max(2000).optional(),
});

/** Body for POST /api/negotiations/[id]/accept — manager accepts a proposal. */
export const AcceptProposalSchema = z.object({
  comment: z.string().max(2000).optional(),
});

/** Body for POST /api/negotiations/[id]/reject — manager rejects a proposal. */
export const RejectProposalSchema = z.object({
  reason: z.string().min(1).max(2000),
});

/** Body for POST /api/negotiations/[id]/comments — add a comment. */
export const AddCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  /**
   * Internal-only comments are never exposed to the customer. Restricted to
   * non-CUSTOMER roles in the service layer.
   */
  internal: z.boolean().default(false),
});

export type NegotiationChangeInput = z.infer<typeof NegotiationChangeSchema>;
export type SubmitProposalInput = z.infer<typeof SubmitProposalSchema>;
export type AcceptProposalInput = z.infer<typeof AcceptProposalSchema>;
export type RejectProposalInput = z.infer<typeof RejectProposalSchema>;
export type AddCommentInput = z.infer<typeof AddCommentSchema>;
