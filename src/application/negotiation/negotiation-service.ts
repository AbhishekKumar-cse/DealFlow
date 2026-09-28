// src/application/negotiation/negotiation-service.ts — Orchestrates the
// customer-facing negotiation flow (Phase 11).
//
// Customer proposals NEVER mutate quote records directly. Each proposal
// creates a NegotiationRequest (status=OPEN) with one or more
// NegotiationChange rows. Each change is independently simulated against the
// current quote state to compute the would-be new risk score + band; the
// simulation results are persisted on the change row so the internal queue
// can show managers whether accepting the proposal will escalate the risk
// band (and therefore invalidate the existing approval).
//
// acceptProposal (MANAGER / FINANCE_OPERATIONS / ADMIN) applies the changes
// to the actual QuoteLine rows (bypassing the editable-state check because
// this is an authorized manager action), recomputes risk, and if the band
// escalated: invalidates the existing approval + re-routes to a new approval
// chain.
//
// Layered design (mirrors Phases 05–10):
//   domain/negotiation/types    → pure-domain types + risk-band rank table
//   domain/quotation/calculator  → pure line + quote math
//   domain/risk/*               → pure risk engine
//   application/risk             → evaluateQuoteRisk (persist snapshot)
//   application/approval        → routeApproval + invalidatePendingApprovals
//   application/.../this file   → DB + audit + simulation
//   api/...                     → HTTP + RBAC
//
// Money is integer cents throughout. No decimal math.

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import { notify } from '@/services/notifications/notify';
import type { Role, RiskBand, CustomerTier } from '@/lib/enums';
import { NotFoundError, ConflictError } from '@/lib/api-error';
import { ForbiddenError } from '@/lib/auth';
import { calculateLine, calculateQuote } from '@/domain/quotation/calculator';
import type { QuoteLineInput } from '@/domain/quotation/entities';
import { resolveDiscountRule } from '@/domain/risk/discount-policy-resolver';
import { calculateRisk } from '@/domain/risk/risk-score-calculator';
import type {
  LineEvaluationInput,
  RiskConfigRow,
  RiskResult,
} from '@/domain/risk/types';
import { evaluateQuoteRisk } from '@/application/risk/risk-service';
import {
  routeApproval,
  invalidatePendingApprovals,
  type SessionActor,
} from '@/application/approval/approval-service';
import { getOrCreateRiskConfig } from '@/app/api/risk-config/route';
import {
  NEGOTIABLE_QUOTE_STATUSES,
  SAFE_MESSAGE_REQUIRES_APPROVAL,
  SAFE_MESSAGE_SUBMITTED,
  riskBandEscalates,
  type NegotiationChangeRow,
  type NegotiationCommentRow,
  type NegotiationField,
  type NegotiationProposalResult,
  type NegotiationRequestRow,
} from '@/domain/negotiation/types';

// ──────────────────────────────────────────────────────────────────────
// submitProposal — customer submits a counter-offer
// ──────────────────────────────────────────────────────────────────────

export async function submitProposal(
  quoteId: string,
  actor: SessionActor & { customerId?: string },
  input: { changes: { quoteLineId: string; field: NegotiationField; newValue: number }[]; message?: string },
): Promise<NegotiationProposalResult> {
  // STEP 1 — RBAC: only CUSTOMER can submit a proposal, and only against
  // their own organization's quote.
  if (actor.role !== 'CUSTOMER') {
    throw new ForbiddenError('Only customers can submit negotiation proposals.');
  }
  if (!actor.customerId) {
    throw new ForbiddenError('Your account is not linked to a customer organization.');
  }
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, customerId: true, status: true, riskBand: true, taxPercent: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  if (quote.customerId !== actor.customerId) {
    throw new ForbiddenError('You can only propose changes on your own organization\'s quotes.');
  }

  // STEP 2 — Quote must be in a negotiable status.
  if (!NEGOTIABLE_QUOTE_STATUSES.has(quote.status)) {
    throw new ConflictError(
      `This quote (${quote.status.replace('_', ' ').toLowerCase()}) is not open for negotiation.`,
    );
  }

  // STEP 3 — Load the quote's lines (with product + cost) for simulation.
  const lines = await db.quoteLine.findMany({
    where: { quoteId },
    include: { product: { select: { categoryId: true } } },
  });
  if (lines.length === 0) {
    throw new ConflictError('Cannot propose changes on a quote with no lines.');
  }

  // STEP 4 — Validate each change targets a real line on this quote.
  const lineById = new Map(lines.map((l) => [l.id, l]));
  for (const c of input.changes) {
    if (!lineById.has(c.quoteLineId)) {
      throw new NotFoundError(`Quote line ${c.quoteLineId} not found on this quote.`);
    }
    if (c.field === 'discountPercent' && (c.newValue < 0 || c.newValue > 100)) {
      throw new ConflictError('Discount percent must be between 0 and 100.');
    }
    if (c.field === 'qty' && (c.newValue < 1 || c.newValue > 10000)) {
      throw new ConflictError('Quantity must be a positive integer (1..10000).');
    }
  }

  // STEP 5 — Load the active discount rules + risk config (mirrors
  // evaluateQuoteRisk) so we can run the pure risk engine locally with the
  // simulated line values.
  const rules = await db.discountRule.findMany({ where: { active: true } });
  const configRow = await getOrCreateRiskConfig();
  const config: RiskConfigRow = {
    safeMax: configRow.safeMax,
    reviewMax: configRow.reviewMax,
    managerMax: configRow.managerMax,
    marginFactorLow: configRow.marginFactorLow,
    marginFactorHigh: configRow.marginFactorHigh,
    marginLowThreshold: configRow.marginLowThreshold,
    revenueConcentrationThreshold: configRow.revenueConcentrationThreshold,
    multiViolationPenalty: configRow.multiViolationPenalty,
    highRevenuePenalty: configRow.highRevenuePenalty,
    lowMarginPenalty: configRow.lowMarginPenalty,
    negotiationEscalationPenalty: configRow.negotiationEscalationPenalty,
    totalDiscountPenalty: configRow.totalDiscountPenalty,
    totalDiscountThreshold: configRow.totalDiscountThreshold,
    minDenominator: configRow.minDenominator,
  };
  const customer = await db.customer.findUnique({
    where: { id: quote.customerId },
    select: { tier: true },
  });
  const customerTier = (customer?.tier as CustomerTier) ?? null;

  // The current persisted band (from the original submitQuote evaluation).
  // We compare each simulated band to this to detect escalation.
  const currentBand = (quote.riskBand as RiskBand | null) ?? null;

  // STEP 6 — Create the NegotiationRequest row first (we need its id for
  // the change rows).
  const request = await db.negotiationRequest.create({
    data: {
      quoteId,
      customerId: quote.customerId,
      status: 'OPEN',
      message: input.message ?? null,
      createdBy: actor.id,
    },
  });

  // STEP 7 — For each change, simulate the would-be new risk independently
  // (apply ONLY that one change to the current line set, hold all other
  // lines at their current values). Persist newRiskScore / newRiskBand /
  // invalidatesApproval on the change row.
  let requestInvalidates = false;
  let worstNewScore: number | null = null;
  let worstNewBand: RiskBand | null = null;

  const changeRows = await Promise.all(
    input.changes.map(async (c) => {
      const targetLine = lineById.get(c.quoteLineId)!;
      const oldValue =
        c.field === 'discountPercent'
          ? String(targetLine.discountPercent)
          : String(targetLine.qty);
      const newValue = String(c.newValue);

      // Simulate: apply just this change to the current line set. Each line
      // is recomputed via the pure calculateLine so gross/discount/net/margin
      // stay integer-cents consistent with how the quote is normally stored.
      let simSubtotalCents = 0;
      let simDiscountCents = 0;
      const simulatedInputs: LineEvaluationInput[] = lines.map((l) => {
        const isTarget = l.id === c.quoteLineId;
        const newQty = isTarget && c.field === 'qty' ? c.newValue : l.qty;
        const newDiscount =
          isTarget && c.field === 'discountPercent' ? c.newValue : l.discountPercent;
        const calc = calculateLine({
          productId: l.productId,
          productName: l.productName,
          billingType: l.billingType as any,
          interval: l.interval as any,
          intervalCount: l.intervalCount ?? undefined,
          qty: newQty,
          unitPriceCents: l.unitPriceCents,
          discountPercent: newDiscount,
          costCents: l.costCents ?? undefined,
        });
        simSubtotalCents += calc.grossCents;
        simDiscountCents += calc.discountCents;
        const resolved = resolveDiscountRule(rules as any, {
          productId: l.productId,
          categoryId: l.product.categoryId,
          customerTier,
        });
        return {
          lineId: l.id,
          productName: l.productName,
          categoryId: l.product.categoryId,
          productId: l.productId,
          customerTier,
          requestedDiscountPercent: newDiscount,
          allowedDiscountPercent: resolved.allowedPercent,
          netCents: calc.netCents,
          marginRatio:
            calc.grossCents > 0
              ? Math.round(((calc.netCents - calc.costTotalCents) / calc.grossCents) * 100)
              : 0,
        };
      });

      // Simulated quote-level totalDiscountPct (mirrors evaluateQuoteRisk).
      const simTotalDiscountPct =
        simSubtotalCents > 0
          ? Math.round((simDiscountCents / simSubtotalCents) * 100)
          : 0;

      // Run the pure risk engine on the simulated line set.
      const simulatedResult: RiskResult = calculateRisk(
        simulatedInputs,
        config,
        {
          negotiationEscalations: 0,
          totalDiscountPct: simTotalDiscountPct,
        },
      );
      const newBand = simulatedResult.band;
      const newScore = simulatedResult.score;
      const invalidates = riskBandEscalates(currentBand, newBand);

      if (invalidates) requestInvalidates = true;
      if (worstNewScore === null || newScore > worstNewScore) {
        worstNewScore = newScore;
        worstNewBand = newBand;
      }

      // Persist the change row with the simulation snapshot.
      return db.negotiationChange.create({
        data: {
          negotiationId: request.id,
          quoteLineId: c.quoteLineId,
          field: c.field,
          oldValue,
          newValue,
          newRiskScore: newScore,
          newRiskBand: newBand,
          invalidatesApproval: invalidates,
        },
      });
    }),
  );

  // STEP 8 — Compose the safe customer-facing message.
  const safeMessage = requestInvalidates
    ? SAFE_MESSAGE_REQUIRES_APPROVAL
    : SAFE_MESSAGE_SUBMITTED;

  // STEP 9 — Audit event `negotiation.submit`.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'negotiation',
    entityId: request.id,
    quoteId,
    action: 'negotiation.submit',
    newValue: {
      changeCount: changeRows.length,
      invalidatesApproval: requestInvalidates,
      newRiskScore: worstNewScore,
      newRiskBand: worstNewBand,
    },
  });

  // Notify the quote owner that a customer submitted a counter-offer.
  await notify({
    userId: quote.ownerId,
    type: 'negotiation.received',
    title: `Counter-offer on ${quote.number}`,
    body: `${actor.name} submitted ${changeRows.length} change(s)${requestInvalidates ? ' — approval invalidated, re-routing required' : ''}.`,
    link: 'negotiations',
  });

  return {
    requestId: request.id,
    status: request.status,
    invalidatesApproval: requestInvalidates,
    newRiskScore: worstNewScore,
    newRiskBand: worstNewBand,
    safeMessage,
  };
}

// ──────────────────────────────────────────────────────────────────────
// acceptProposal — manager accepts the proposal, applies the changes
// ──────────────────────────────────────────────────────────────────────

export async function acceptProposal(
  requestId: string,
  actor: SessionActor,
  options: { comment?: string } = {},
) {
  // STEP 1 — RBAC: SALES_MANAGER, FINANCE_OPERATIONS, ADMIN only.
  if (
    actor.role !== 'SALES_MANAGER' &&
    actor.role !== 'FINANCE_OPERATIONS' &&
    actor.role !== 'ADMIN'
  ) {
    throw new ForbiddenError(
      'Only sales managers, finance operations, or admins can accept negotiation proposals.',
    );
  }

  // STEP 2 — Load the request + changes + quote.
  const request = await db.negotiationRequest.findUnique({
    where: { id: requestId },
    include: { changes: true, quote: { select: { id: true, riskBand: true, taxPercent: true } } },
  });
  if (!request) throw new NotFoundError('Negotiation request not found');
  if (request.status !== 'OPEN') {
    throw new ConflictError(`Negotiation request is already ${request.status}.`);
  }
  const oldBand = (request.quote.riskBand as RiskBand | null) ?? null;

  // STEP 3 — Apply each change to the actual QuoteLine rows. We bypass the
  // editable-state check (this is an authorized manager action, not an
  // edit-by-rep). Multiple changes to the same line are grouped so we
  // apply them together (qty + discountPercent) before recalculating.
  const changesByLine = new Map<string, { qty?: number; discountPercent?: number }>();
  for (const c of request.changes) {
    if (!c.quoteLineId) continue;
    const existing = changesByLine.get(c.quoteLineId) ?? {};
    if (c.field === 'qty') {
      existing.qty = parseInt(c.newValue, 10);
    } else {
      existing.discountPercent = parseInt(c.newValue, 10);
    }
    changesByLine.set(c.quoteLineId, existing);
  }

  // Apply each grouped change.
  for (const [lineId, patch] of Array.from(changesByLine.entries())) {
    const line = await db.quoteLine.findUnique({ where: { id: lineId } });
    if (!line || line.quoteId !== request.quoteId) {
      throw new NotFoundError(`Quote line ${lineId} not found on this quote.`);
    }
    const newQty = patch.qty ?? line.qty;
    const newDiscount = patch.discountPercent ?? line.discountPercent;
    const calc = calculateLine({
      productId: line.productId,
      productName: line.productName,
      billingType: line.billingType as any,
      interval: line.interval as any,
      intervalCount: line.intervalCount ?? undefined,
      qty: newQty,
      unitPriceCents: line.unitPriceCents,
      discountPercent: newDiscount,
      costCents: line.costCents ?? undefined,
    });
    await db.quoteLine.update({
      where: { id: lineId },
      data: {
        qty: newQty,
        discountPercent: newDiscount,
        grossCents: calc.grossCents,
        discountCents: calc.discountCents,
        netCents: calc.netCents,
        marginCents: calc.marginCents,
      },
    });
  }

  // STEP 4 — Recompute the quote totals from the updated lines.
  await recalcQuoteTotals(request.quoteId);

  // STEP 5 — Recompute risk + persist snapshot via evaluateQuoteRisk.
  const risk = await evaluateQuoteRisk(request.quoteId);
  const newBand = risk.band;

  // STEP 6 — If the risk band escalated, invalidate the existing approval
  // and re-route to a new approval chain.
  let invalidated = 0;
  let reRouted = false;
  if (riskBandEscalates(oldBand, newBand)) {
    const inv = await invalidatePendingApprovals(
      request.quoteId,
      'negotiation accepted — risk escalated',
      actor,
    );
    invalidated = inv.invalidated;
    await routeApproval(
      request.quoteId,
      { score: risk.score, band: newBand },
      actor,
    );
    reRouted = true;
  }

  // STEP 7 — Update the NegotiationRequest status to ACCEPTED.
  await db.negotiationRequest.update({
    where: { id: requestId },
    data: { status: 'ACCEPTED', resolvedAt: new Date() },
  });

  // STEP 8 — If a comment was provided, persist it as a non-internal comment
  // (the manager's response is visible to the customer).
  if (options.comment && options.comment.trim().length > 0) {
    await db.negotiationComment.create({
      data: {
        negotiationId: requestId,
        authorId: actor.id,
        authorName: actor.name,
        authorRole: actor.role,
        body: options.comment.trim(),
        internal: false,
      },
    });
  }

  // STEP 9 — Audit event `negotiation.accept`.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'negotiation',
    entityId: requestId,
    quoteId: request.quoteId,
    action: 'negotiation.accept',
    reason: options.comment ?? null,
    oldValue: { riskBand: oldBand },
    newValue: {
      riskBand: newBand,
      riskScore: risk.score,
      invalidatedApprovals: invalidated,
      reRouted,
    },
  });

  return {
    requestId,
    status: 'ACCEPTED',
    riskBand: newBand,
    riskScore: risk.score,
    invalidatedApprovals: invalidated,
    reRouted,
  };
}

// ──────────────────────────────────────────────────────────────────────
// rejectProposal — manager rejects the proposal
// ──────────────────────────────────────────────────────────────────────

export async function rejectProposal(
  requestId: string,
  actor: SessionActor,
  options: { reason: string },
) {
  // STEP 1 — RBAC.
  if (
    actor.role !== 'SALES_MANAGER' &&
    actor.role !== 'FINANCE_OPERATIONS' &&
    actor.role !== 'ADMIN'
  ) {
    throw new ForbiddenError(
      'Only sales managers, finance operations, or admins can reject negotiation proposals.',
    );
  }
  if (!options.reason || !options.reason.trim()) {
    throw new ConflictError('A reason is required to reject a proposal.');
  }

  // STEP 2 — Load + validate.
  const request = await db.negotiationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, quoteId: true },
  });
  if (!request) throw new NotFoundError('Negotiation request not found');
  if (request.status !== 'OPEN') {
    throw new ConflictError(`Negotiation request is already ${request.status}.`);
  }

  // STEP 3 — Update status to REJECTED.
  await db.negotiationRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', resolvedAt: new Date() },
  });

  // STEP 4 — Persist the rejection reason as a customer-visible comment.
  await db.negotiationComment.create({
    data: {
      negotiationId: requestId,
      authorId: actor.id,
      authorName: actor.name,
      authorRole: actor.role,
      body: options.reason.trim(),
      internal: false,
    },
  });

  // STEP 5 — Audit event `negotiation.reject`.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'negotiation',
    entityId: requestId,
    quoteId: request.quoteId,
    action: 'negotiation.reject',
    reason: options.reason,
    newValue: { status: 'REJECTED' },
  });

  return { requestId, status: 'REJECTED' };
}

// ──────────────────────────────────────────────────────────────────────
// addComment — add a comment to a negotiation thread
// ──────────────────────────────────────────────────────────────────────

export async function addComment(
  requestId: string,
  actor: SessionActor,
  input: { body: string; internal?: boolean },
) {
  // STEP 1 — Internal-only comments are restricted to non-CUSTOMER roles.
  if (input.internal && actor.role === 'CUSTOMER') {
    throw new ForbiddenError('Internal comments are restricted to the DealFlow360 team.');
  }

  // STEP 2 — Validate the request exists + the actor has visibility (role
  // scoping mirrors listNegotiations).
  const request = await db.negotiationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, quoteId: true, customerId: true },
  });
  if (!request) throw new NotFoundError('Negotiation request not found');
  await assertCanAccessNegotiation(actor, request);

  // STEP 3 — Persist the comment.
  const comment = await db.negotiationComment.create({
    data: {
      negotiationId: requestId,
      authorId: actor.id,
      authorName: actor.name,
      authorRole: actor.role,
      body: input.body.trim(),
      internal: input.internal ?? false,
    },
  });

  // STEP 4 — Audit event `negotiation.comment`.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'negotiation',
    entityId: requestId,
    quoteId: request.quoteId,
    action: 'negotiation.comment',
    newValue: { internal: input.internal ?? false, length: input.body.length },
  });

  return comment;
}

// ──────────────────────────────────────────────────────────────────────
// listNegotiations — role-scoped paginated list
// ──────────────────────────────────────────────────────────────────────

export async function listNegotiations(
  actor: SessionActor & { customerId?: string },
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    quoteId?: string;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (options.status) where.status = options.status;
  if (options.quoteId) where.quoteId = options.quoteId;

  // Role scoping.
  if (actor.role === 'CUSTOMER') {
    if (!actor.customerId) {
      throw new ForbiddenError('Your account is not linked to a customer organization.');
    }
    where.customerId = actor.customerId;
  } else if (actor.role === 'SALES_REP') {
    // Quotes the rep owns OR that belong to assigned customers.
    where.OR = [
      { quote: { ownerId: actor.id } },
      { customer: { assignedRepId: actor.id } },
    ];
  }
  // MANAGER / FINANCE / ADMIN — no filter.

  const [total, rows] = await Promise.all([
    db.negotiationRequest.count({ where }),
    db.negotiationRequest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        changes: true,
        quote: {
          select: {
            id: true,
            number: true,
            status: true,
            customer: { select: { id: true, name: true, tier: true } },
            owner: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const data = rows.map(serializeRequest);
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ──────────────────────────────────────────────────────────────────────
// getNegotiation — single negotiation with changes + comments
// ──────────────────────────────────────────────────────────────────────

export async function getNegotiation(
  requestId: string,
  actor: SessionActor & { customerId?: string },
) {
  const request = await db.negotiationRequest.findUnique({
    where: { id: requestId },
    include: {
      changes: true,
      comments: { orderBy: { createdAt: 'asc' } },
      quote: {
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { id: true, name: true, tier: true } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!request) throw new NotFoundError('Negotiation request not found');
  await assertCanAccessNegotiation(actor, request);

  return serializeRequest(request, { includeComments: true, actor });
}

// ──────────────────────────────────────────────────────────────────────
// listNegotiationsForQuote — all negotiations for a single quote
// ──────────────────────────────────────────────────────────────────────

export async function listNegotiationsForQuote(
  quoteId: string,
  actor: SessionActor & { customerId?: string },
) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, customerId: true, ownerId: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');

  // Role scoping.
  if (actor.role === 'CUSTOMER') {
    if (!actor.customerId || quote.customerId !== actor.customerId) {
      throw new ForbiddenError('You can only view negotiations on your own quotes.');
    }
  } else if (actor.role === 'SALES_REP') {
    // Allow if the rep owns the quote OR the customer is assigned to them.
    if (quote.ownerId !== actor.id) {
      const customer = await db.customer.findUnique({
        where: { id: quote.customerId },
        select: { assignedRepId: true },
      });
      if (customer?.assignedRepId !== actor.id) {
        throw new ForbiddenError('You can only view negotiations on quotes you own or that belong to your assigned customers.');
      }
    }
  }

  const rows = await db.negotiationRequest.findMany({
    where: { quoteId },
    orderBy: { createdAt: 'desc' },
    include: {
      changes: true,
      comments: { orderBy: { createdAt: 'asc' } },
    },
  });
  return rows.map((r) => serializeRequest(r, { includeComments: true, actor }));
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Recompute the quote's denormalized totals from its current lines and
 * persist them. Mirrors the private `recalcQuoteTotals` in
 * quotation-service.ts but is exported for the negotiation accept flow
 * (which bypasses the editable-state check).
 */
async function recalcQuoteTotals(quoteId: string): Promise<void> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  const lineInputs: QuoteLineInput[] = quote.lines.map((l) => ({
    productId: l.productId,
    productName: l.productName,
    billingType: l.billingType as any,
    interval: l.interval as any,
    intervalCount: l.intervalCount ?? undefined,
    qty: l.qty,
    unitPriceCents: l.unitPriceCents,
    discountPercent: l.discountPercent,
    costCents: l.costCents ?? undefined,
  }));
  const calc = calculateQuote(lineInputs, quote.taxPercent);
  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotalCents: calc.totals.subtotalCents,
      discountCents: calc.totals.discountCents,
      taxCents: calc.totals.taxCents,
      totalCents: calc.totals.totalCents,
      estimatedCostCents: calc.totals.estimatedCostCents,
      estimatedMarginPct: calc.totals.estimatedMarginPct,
    },
  });
}

/**
 * Role-scoped access check. Throws ForbiddenError if the actor cannot see
 * this negotiation. CUSTOMER: must own the customer. SALES_REP: must own
 * the quote OR the customer must be assigned to them. MANAGER / FINANCE /
 * ADMIN: no restriction.
 */
async function assertCanAccessNegotiation(
  actor: SessionActor & { customerId?: string },
  request: { customerId: string; quoteId: string },
) {
  if (actor.role === 'CUSTOMER') {
    if (!actor.customerId || request.customerId !== actor.customerId) {
      throw new ForbiddenError('You can only view your own organization\'s negotiations.');
    }
    return;
  }
  if (actor.role === 'SALES_REP') {
    const quote = await db.quote.findUnique({
      where: { id: request.quoteId },
      select: { ownerId: true, customerId: true },
    });
    if (!quote) throw new NotFoundError('Quote not found');
    if (quote.ownerId === actor.id) return;
    const customer = await db.customer.findUnique({
      where: { id: quote.customerId },
      select: { assignedRepId: true },
    });
    if (customer?.assignedRepId === actor.id) return;
    throw new ForbiddenError('You can only view negotiations on quotes you own or that belong to your assigned customers.');
  }
  // MANAGER / FINANCE / ADMIN — no restriction.
}

/**
 * Serialize a NegotiationRequest (with its changes + comments) for the API
 * layer. Computes the request-level `invalidatesApproval`, `newRiskScore`,
 * `newRiskBand`, and `customerSafeMessage` from the change rows (these are
 * not stored as separate columns on the schema; the change rows carry the
 * per-line simulation snapshot). For CUSTOMER role, internal comments are
 * filtered out and the safe message is the only customer-facing string.
 */
function serializeRequest(
  request: any,
  options: { includeComments?: boolean; actor?: SessionActor & { customerId?: string } } = {},
): NegotiationRequestRow {
  const changes: NegotiationChangeRow[] = (request.changes ?? []).map((c: any) => ({
    id: c.id,
    negotiationId: c.negotiationId,
    quoteLineId: c.quoteLineId,
    field: c.field as NegotiationField,
    oldValue: c.oldValue,
    newValue: c.newValue,
    newRiskScore: c.newRiskScore,
    newRiskBand: c.newRiskBand as RiskBand | null,
    invalidatesApproval: c.invalidatesApproval,
    createdAt: c.createdAt,
  }));

  const invalidatesApproval = changes.some((c) => c.invalidatesApproval);
  let worstScore: number | null = null;
  let worstBand: RiskBand | null = null;
  for (const c of changes) {
    if (c.newRiskScore != null && (worstScore === null || c.newRiskScore > worstScore)) {
      worstScore = c.newRiskScore;
      worstBand = c.newRiskBand;
    }
  }
  const safeMessage = invalidatesApproval
    ? SAFE_MESSAGE_REQUIRES_APPROVAL
    : SAFE_MESSAGE_SUBMITTED;

  // Filter internal comments for CUSTOMER role.
  let comments: NegotiationCommentRow[] = [];
  if (options.includeComments) {
    const all: NegotiationCommentRow[] = (request.comments ?? []).map((c: any) => ({
      id: c.id,
      negotiationId: c.negotiationId,
      authorId: c.authorId,
      authorName: c.authorName,
      authorRole: c.authorRole,
      body: c.body,
      internal: c.internal,
      createdAt: c.createdAt,
    }));
    if (options.actor?.role === 'CUSTOMER') {
      comments = all.filter((c) => !c.internal);
    } else {
      comments = all;
    }
  }

  return {
    id: request.id,
    quoteId: request.quoteId,
    customerId: request.customerId,
    status: request.status,
    message: request.message,
    customerSafeMessage: safeMessage,
    invalidatesApproval,
    newRiskScore: worstScore,
    newRiskBand: worstBand,
    createdBy: request.createdBy,
    createdAt: request.createdAt,
    resolvedAt: request.resolvedAt,
    changes,
    comments,
    quote: request.quote
      ? {
          id: request.quote.id,
          number: request.quote.number,
          status: request.quote.status,
          customer: request.quote.customer,
          owner: request.quote.owner,
        }
      : null,
  };
}
