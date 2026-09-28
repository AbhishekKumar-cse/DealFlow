// src/application/approval/approval-service.ts — Orchestrate approval
// requests, decisions, rejections, returns, and stale-approval invalidation.
//
// On submit (called from quotation-service):
//   1. Look up the approval chain matching the quote's risk band.
//   2. Create an ApprovalRequest with currentStep=1 and the required role
//      for the first step.
//   3. Transition quote to PENDING_MANAGER / PENDING_FINANCE per band.
//
// On decision:
//   1. Verify the approver has the required role.
//   2. Block self-approval (approver ≠ quote.owner).
//   3. Record the decision, advance the chain or finalize.

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import { notify, notifyRole } from '@/services/notifications/notify';
import { resolveApprovalChain } from '@/domain/approval/policy-resolver';
import { BAND_DEFAULT_ROLE } from '@/domain/approval/types';
import type { ApprovalStatus, RiskBand, Role } from '@/lib/enums';
import { NotFoundError, ConflictError } from '@/lib/api-error';
import { ForbiddenError } from "@/lib/auth";

export interface SessionActor {
  id: string;
  name: string;
  role: Role;
}

/** Route a quote into approval based on its risk band. */
export async function routeApproval(
  quoteId: string,
  risk: { score: number; band: RiskBand },
  requestedBy: SessionActor,
): Promise<{ request: any | null; skipped: boolean; reason: string }> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, ownerId: true, status: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');

  // SAFE band: no approval needed → directly APPROVED.
  if (risk.band === 'SAFE') {
    await db.quote.update({ where: { id: quoteId }, data: { status: 'APPROVED' } });
    await audit({
      actorId: requestedBy.id,
      actorRole: requestedBy.role,
      actorName: requestedBy.name,
      entityType: 'quote',
      entityId: quoteId,
      action: 'quote.autoApprove',
      newValue: { reason: 'SAFE risk band', riskScore: risk.score },
    });
    return { request: null, skipped: true, reason: 'SAFE band auto-approved' };
  }

  // Find a matching chain.
  const chains = await db.approvalChain.findMany({
    where: { active: true },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  const chain = resolveApprovalChain(chains as any, risk.band);
  const requiredRole = chain?.steps[0]?.requiredRole ?? BAND_DEFAULT_ROLE[risk.band];

  if (!requiredRole) {
    // No chain & no default role → reject (defensive).
    throw new ConflictError(`No approval chain matches risk band ${risk.band}.`);
  }

  // Create the approval request.
  const request = await db.approvalRequest.create({
    data: {
      quoteId,
      chainId: chain?.id ?? null,
      requiredRole,
      currentStep: 1,
      status: 'PENDING',
      riskBand: risk.band,
      riskScore: risk.score,
      requestedById: requestedBy.id,
    },
  });

  // Transition quote to PENDING_MANAGER or PENDING_FINANCE.
  const nextStatus = requiredRole === 'FINANCE_OPERATIONS' ? 'PENDING_FINANCE' : 'PENDING_MANAGER';
  await db.quote.update({ where: { id: quoteId }, data: { status: nextStatus } });

  await audit({
    actorId: requestedBy.id,
    actorRole: requestedBy.role,
    actorName: requestedBy.name,
    entityType: 'approval',
    entityId: request.id,
    quoteId,
    action: 'approval.request',
    newValue: { requiredRole, chainId: chain?.id, riskBand: risk.band, riskScore: risk.score },
  });

  // Notify all users with the required role that a new approval is pending.
  const quoteInfo = await db.quote.findUnique({
    where: { id: quoteId },
    select: { number: true, customer: { select: { name: true } } },
  });
  await notifyRole(requiredRole, {
    type: 'approval.requested',
    title: `Approval needed: ${quoteInfo?.number ?? quoteId}`,
    body: `${quoteInfo?.customer?.name ?? 'A customer'} quote is pending ${requiredRole.replace('_', ' ').toLowerCase()} approval. Risk: ${risk.band} (${risk.score}/100).`,
    link: 'approvals',
  });

  return { request, skipped: false, reason: `Routed to ${requiredRole}` };
}

/** Approve / reject / return the current step of an approval request. */
export async function decide(
  actor: SessionActor,
  requestId: string,
  decision: ApprovalStatus,
  comment?: string,
) {
  const request = await db.approvalRequest.findUnique({
    where: { id: requestId },
    include: { quote: true, chain: { include: { steps: { orderBy: { order: 'asc' } } } } },
  });
  if (!request) throw new NotFoundError('Approval request not found');
  if (request.status !== 'PENDING') {
    throw new ConflictError(`Approval request is already ${request.status}.`);
  }
  // Role check.
  if (request.requiredRole !== actor.role && actor.role !== 'ADMIN') {
    throw new ForbiddenError(
      `This step requires a ${request.requiredRole.replace('_', ' ').toLowerCase()}.`,
    );
  }
  // Self-approval block.
  if (request.quote.ownerId === actor.id) {
    throw new ForbiddenError('You cannot approve your own quote.');
  }

  // Record the decision.
  await db.approvalDecision.create({
    data: {
      requestId,
      approverId: actor.id,
      decision,
      step: request.currentStep,
      comment,
    },
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'approval',
    entityId: requestId,
    quoteId: request.quoteId,
    action: `approval.${decision.toLowerCase()}`,
    reason: comment,
    newValue: { step: request.currentStep, decision },
  });

  if (decision === 'APPROVED') {
    const result = await advanceOrFinalize(actor, request);
    // Notify the quote owner of the approval.
    await notify({
      userId: request.quote.ownerId,
      type: 'approval.decision',
      title: `Quote ${request.quote.number} ${result.status === 'APPROVED' ? 'approved' : 'advanced'}`,
      body: `${actor.name} approved step ${request.currentStep}.`,
      link: `quotes`,
    });
    return result;
  }
  if (decision === 'REJECTED') {
    await db.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
    await db.quote.update({
      where: { id: request.quoteId },
      data: { status: 'REJECTED' },
    });
    await notify({
      userId: request.quote.ownerId,
      type: 'approval.decision',
      title: `Quote ${request.quote.number} rejected`,
      body: `${actor.name} rejected the quote${comment ? `: ${comment}` : '.'}`,
      link: `quotes`,
    });
    return { status: 'REJECTED' as ApprovalStatus };
  }
  if (decision === 'RETURNED') {
    await db.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'RETURNED', resolvedAt: new Date() },
    });
    await db.quote.update({
      where: { id: request.quoteId },
      data: { status: 'RETURNED' },
    });
    await notify({
      userId: request.quote.ownerId,
      type: 'approval.decision',
      title: `Quote ${request.quote.number} returned for revision`,
      body: `${actor.name} returned the quote${comment ? `: ${comment}` : '.'}`,
      link: `quotes`,
    });
    return { status: 'RETURNED' as ApprovalStatus };
  }
  throw new ConflictError('Invalid decision.');
}

async function advanceOrFinalize(actor: SessionActor, request: any) {
  const chain = request.chain;
  const steps = chain?.steps ?? [];
  const nextStep = steps.find((s: any) => s.order > request.currentStep);

  if (nextStep) {
    // Advance to the next step.
    await db.approvalRequest.update({
      where: { id: request.id },
      data: {
        currentStep: nextStep.order,
        requiredRole: nextStep.requiredRole,
      },
    });
    const nextStatus =
      nextStep.requiredRole === 'FINANCE_OPERATIONS' ? 'PENDING_FINANCE' : 'PENDING_MANAGER';
    await db.quote.update({
      where: { id: request.quoteId },
      data: { status: nextStatus },
    });
    return { status: 'ADVANCED' as ApprovalStatus, nextStep: nextStep.order };
  }

  // No more steps — finalize as APPROVED.
  await db.approvalRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', resolvedAt: new Date() },
  });
  await db.quote.update({
    where: { id: request.quoteId },
    data: { status: 'APPROVED' },
  });
  return { status: 'APPROVED' as ApprovalStatus };
}

/** Invalidate a stale approval when the quote materially changes.
 *  Used by Phase 11 (customer negotiation). */
export async function invalidatePendingApprovals(
  quoteId: string,
  reason: string,
  actor: SessionActor,
) {
  const pending = await db.approvalRequest.findMany({
    where: { quoteId, status: 'PENDING' },
  });
  if (pending.length === 0) return { invalidated: 0 };
  for (const p of pending) {
    await db.approvalRequest.update({
      where: { id: p.id },
      data: { status: 'SUPERSEDED', resolvedAt: new Date() },
    });
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      entityType: 'approval',
      entityId: p.id,
      quoteId,
      action: 'approval.invalidate',
      reason,
    });
  }
  return { invalidated: pending.length };
}

/** Get pending approval requests for a given user (queue). */
export async function getApprovalQueueForUser(user: SessionActor) {
  // ADMIN sees all; others see only requests matching their role.
  if (user.role === 'ADMIN') {
    return db.approvalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        quote: {
          include: {
            customer: { select: { id: true, name: true, tier: true } },
            owner: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
  return db.approvalRequest.findMany({
    where: { status: 'PENDING', requiredRole: user.role },
    orderBy: { createdAt: 'asc' },
    include: {
      quote: {
        include: {
          customer: { select: { id: true, name: true, tier: true } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** Get all approval history for a quote (timeline). */
export async function getApprovalTimeline(quoteId: string) {
  return db.approvalRequest.findMany({
    where: { quoteId },
    orderBy: { createdAt: 'asc' },
    include: {
      decisions: {
        include: {
          approver: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      requestedBy: { select: { id: true, name: true } },
      chain: { include: { steps: { orderBy: { order: 'asc' } } } },
    },
  });
}
