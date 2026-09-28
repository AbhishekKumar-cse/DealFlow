// src/application/quotation/quotation-service.ts — Orchestrates quote CRUD
// and submission. Pure domain engine does the math; this service does the
// DB + audit. Phase 06 wires the risk engine into submit(); Phase 07 wires
// the approval workflow.

import { db } from '@/lib/db';
import { calculateQuote, calculateLine } from '@/domain/quotation/calculator';
import {
  assertCanTransition,
  canSubmit,
  canConfirm,
  canCancel,
  isEditable,
} from '@/domain/quotation/rules';
import { resolveUnitPrice } from '@/domain/quotation/price-resolution';
import type { QuoteLineInput, QuoteCalcResult } from '@/domain/quotation/entities';
import { EmptyQuoteError, InvalidStateTransitionError } from '@/domain/quotation/errors';
import { audit } from '@/services/audit/audit';
import type { Role } from '@/lib/enums';
import { NotFoundError, ConflictError } from '@/lib/api-error';
import { evaluateQuoteRisk } from '@/application/risk/risk-service';
import { routeApproval } from '@/application/approval/approval-service';

export interface CreateQuoteInput {
  customerId: string;
  ownerId: string;
  priceListId?: string;
  currency?: string;
  taxPercent?: number;
  notes?: string;
  expectedDeliveryDate?: string;
}

export interface UpdateQuoteInput {
  priceListId?: string;
  taxPercent?: number;
  notes?: string;
  expectedDeliveryDate?: string;
}

export interface AddLineInput {
  productId: string;
  qty: number;
  discountPercent: number;
  /** Optional override of resolved unit price (must be ≥ 0). */
  unitPriceCents?: number;
}

export async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  // Find the highest existing number with this prefix.
  const last = await db.quote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let next = 1;
  if (last) {
    const m = last.number.match(/Q-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function createQuote(
  actor: { id: string; name: string; role: Role },
  input: CreateQuoteInput,
) {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new NotFoundError('Customer not found');
  if (!customer.active) throw new ConflictError('Customer is inactive.');

  if (input.priceListId) {
    const list = await db.priceList.findUnique({ where: { id: input.priceListId } });
    if (!list || !list.active) throw new NotFoundError('Price list not found');
  }

  const number = await generateQuoteNumber();
  const quote = await db.quote.create({
    data: {
      number,
      customerId: input.customerId,
      ownerId: actor.id,
      priceListId: input.priceListId ?? null,
      currency: input.currency ?? 'USD',
      taxPercent: input.taxPercent ?? 0,
      notes: input.notes,
      expectedDeliveryDate: input.expectedDeliveryDate
        ? new Date(input.expectedDeliveryDate)
        : null,
      status: 'DRAFT',
      revision: 1,
    },
    include: { customer: true, owner: true },
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quote.id,
    action: 'quote.create',
    newValue: { number, customerId: input.customerId, status: 'DRAFT' },
  });
  return quote;
}

export async function getQuote(id: string) {
  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      owner: { select: { id: true, name: true, email: true } },
      priceList: true,
      lines: { include: { product: true } },
      approvals: {
        include: { decisions: { include: { approver: true } } },
        orderBy: { createdAt: 'desc' },
      },
      revisions: { orderBy: { revision: 'desc' } },
      healthEvents: { orderBy: { detectedAt: 'desc' }, take: 5 },
    },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  return quote;
}

export async function listQuotes(
  actor: { id: string; role: Role; customerId?: string },
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
    customerId?: string;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  // Role-scoped:
  // CUSTOMER → only own organization's quotes
  // SALES_REP → own quotes + assigned customers' quotes
  // MANAGER/FINANCE/ADMIN → all
  const where: any = {};
  if (actor.role === 'CUSTOMER') {
    where.customerId = actor.customerId;
  } else if (actor.role === 'SALES_REP') {
    where.OR = [{ ownerId: actor.id }, { customer: { assignedRepId: actor.id } }];
  }
  if (options.customerId) where.customerId = options.customerId;
  if (options.status) where.status = options.status;
  if (options.search) where.number = { contains: options.search };

  const [total, data] = await Promise.all([
    db.quote.count({ where }),
    db.quote.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, tier: true } },
        owner: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function updateQuote(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  input: UpdateQuoteInput,
) {
  const existing = await db.quote.findUnique({ where: { id: quoteId } });
  if (!existing) throw new NotFoundError('Quote not found');
  if (!isEditable(existing.status as any)) {
    throw new InvalidStateTransitionError(existing.status, 'EDIT');
  }
  await assertQuoteOwnerOrHigher(actor, existing);

  const updated = await db.quote.update({
    where: { id: quoteId },
    data: {
      priceListId: input.priceListId,
      taxPercent: input.taxPercent,
      notes: input.notes,
      expectedDeliveryDate: input.expectedDeliveryDate
        ? new Date(input.expectedDeliveryDate)
        : null,
    },
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.update',
    newValue: input as any,
  });
  return updated;
}

export async function addLine(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  input: AddLineInput,
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  if (!isEditable(quote.status as any)) {
    throw new InvalidStateTransitionError(quote.status, 'EDIT');
  }
  await assertQuoteOwnerOrHigher(actor, quote);

  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new NotFoundError('Product not found');
  if (!product.active) throw new ConflictError('Product is inactive.');

  const price = await resolveUnitPrice(input.productId, quote.priceListId ?? undefined);
  const unitPriceCents = input.unitPriceCents ?? price.unitPriceCents;

  const lineInput: QuoteLineInput = {
    productId: input.productId,
    productName: product.name,
    billingType: product.billingType as any,
    interval: product.defaultInterval as any,
    intervalCount: product.defaultIntervalCount ?? undefined,
    qty: input.qty,
    unitPriceCents,
    discountPercent: input.discountPercent,
    costCents: product.costCents ?? undefined,
  };
  const calculated = calculateLine(lineInput);

  const line = await db.quoteLine.create({
    data: {
      quoteId,
      productId: input.productId,
      productName: product.name,
      billingType: product.billingType,
      interval: product.defaultInterval,
      intervalCount: product.defaultIntervalCount,
      qty: input.qty,
      unitPriceCents,
      discountPercent: input.discountPercent,
      grossCents: calculated.grossCents,
      discountCents: calculated.discountCents,
      netCents: calculated.netCents,
      costCents: product.costCents,
      marginCents: calculated.marginCents,
    },
  });
  await recalcQuoteTotals(quoteId);
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.line.add',
    newValue: { productId: input.productId, qty: input.qty, discountPercent: input.discountPercent },
  });
  return line;
}

export async function updateLine(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  lineId: string,
  patch: Partial<AddLineInput>,
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  if (!isEditable(quote.status as any)) {
    throw new InvalidStateTransitionError(quote.status, 'EDIT');
  }
  await assertQuoteOwnerOrHigher(actor, quote);

  const existing = await db.quoteLine.findUnique({ where: { id: lineId } });
  if (!existing || existing.quoteId !== quoteId) {
    throw new NotFoundError('Quote line not found');
  }

  const updatedQty = patch.qty ?? existing.qty;
  const updatedDiscount = patch.discountPercent ?? existing.discountPercent;
  let updatedUnit = existing.unitPriceCents;
  if (patch.unitPriceCents != null) updatedUnit = patch.unitPriceCents;
  else if (patch.productId && patch.productId !== existing.productId) {
    const price = await resolveUnitPrice(patch.productId, quote.priceListId ?? undefined);
    updatedUnit = price.unitPriceCents;
  }

  // Recompute line.
  const product = await db.product.findUnique({
    where: { id: patch.productId ?? existing.productId },
  });
  if (!product) throw new NotFoundError('Product not found');

  const lineInput: QuoteLineInput = {
    productId: product.id,
    productName: product.name,
    billingType: product.billingType as any,
    interval: product.defaultInterval as any,
    intervalCount: product.defaultIntervalCount ?? undefined,
    qty: updatedQty,
    unitPriceCents: updatedUnit,
    discountPercent: updatedDiscount,
    costCents: product.costCents ?? undefined,
  };
  const calculated = calculateLine(lineInput);

  const updated = await db.quoteLine.update({
    where: { id: lineId },
    data: {
      productId: product.id,
      productName: product.name,
      billingType: product.billingType,
      interval: product.defaultInterval,
      intervalCount: product.defaultIntervalCount,
      qty: updatedQty,
      unitPriceCents: updatedUnit,
      discountPercent: updatedDiscount,
      grossCents: calculated.grossCents,
      discountCents: calculated.discountCents,
      netCents: calculated.netCents,
      costCents: product.costCents,
      marginCents: calculated.marginCents,
    },
  });
  await recalcQuoteTotals(quoteId);
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.line.update',
    oldValue: { qty: existing.qty, discountPercent: existing.discountPercent },
    newValue: { qty: updatedQty, discountPercent: updatedDiscount },
  });
  return updated;
}

export async function removeLine(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  lineId: string,
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  if (!isEditable(quote.status as any)) {
    throw new InvalidStateTransitionError(quote.status, 'EDIT');
  }
  await assertQuoteOwnerOrHigher(actor, quote);

  const line = await db.quoteLine.findUnique({ where: { id: lineId } });
  if (!line || line.quoteId !== quoteId) {
    throw new NotFoundError('Quote line not found');
  }
  await db.quoteLine.delete({ where: { id: lineId } });
  await recalcQuoteTotals(quoteId);
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.line.remove',
    oldValue: { productId: line.productId, qty: line.qty },
  });
  return { ok: true };
}

export async function submitQuote(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  canSubmit(quote.status as any, quote.lines as unknown as QuoteLineInput[]);
  await assertQuoteOwnerOrHigher(actor, quote);

  // Recalculate totals before submission (defensive).
  await recalcQuoteTotals(quoteId);

  // Phase 06 — evaluate discount governance + blended risk. Persist snapshot.
  const risk = await evaluateQuoteRisk(quoteId);

  // Phase 07 — route to approval based on risk band.
  const approval = await routeApproval(quoteId, { score: risk.score, band: risk.band }, {
    id: actor.id,
    name: actor.name,
    role: actor.role,
  });

  // The quote status is now either APPROVED (SAFE), PENDING_MANAGER, or
  // PENDING_FINANCE. Update submittedAt.
  await db.quote.update({
    where: { id: quoteId },
    data: { submittedAt: new Date() },
  });

  // Snapshot a revision for traceability.
  await snapshotRevision(actor, quoteId, 'submit');

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.submit',
    newValue: {
      riskScore: risk.score,
      riskBand: risk.band,
      approvalSkipped: approval.skipped,
      approvalReason: approval.reason,
    },
  });

  return await db.quote.findUnique({ where: { id: quoteId } });
}

export async function confirmQuote(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  canConfirm(quote.status as any);

  const updated = await db.quote.update({
    where: { id: quoteId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });
  await snapshotRevision(actor, quoteId, 'confirm');
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.confirm',
    newValue: { status: 'CONFIRMED' },
  });
  return updated;
}

export async function cancelQuote(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  reason?: string,
) {
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new NotFoundError('Quote not found');
  canCancel(quote.status as any);

  const updated = await db.quote.update({
    where: { id: quoteId },
    data: { status: 'CANCELLED' },
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'quote',
    entityId: quoteId,
    action: 'quote.cancel',
    reason,
    newValue: { status: 'CANCELLED' },
  });
  return updated;
}

/** Recalculate all denormalized quote totals. */
async function recalcQuoteTotals(quoteId: string): Promise<QuoteCalcResult> {
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
  return calc;
}

async function snapshotRevision(
  actor: { id: string; name: string; role: Role },
  quoteId: string,
  reason: string,
) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true },
  });
  if (!quote) return;
  await db.quoteRevision.create({
    data: {
      quoteId,
      revision: quote.revision,
      linesSnapshot: JSON.stringify(quote.lines),
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      riskScore: quote.riskScore,
      riskBand: quote.riskBand,
      reason,
      createdBy: actor.id,
    },
  });
}

/** Permission check: sales rep can edit own (or assigned customer's) quotes. */
async function assertQuoteOwnerOrHigher(
  actor: { id: string; role: Role },
  quote: { ownerId: string; customerId: string },
) {
  if (actor.role === 'SALES_REP') {
    if (quote.ownerId === actor.id) return;
    const customer = await db.customer.findUnique({
      where: { id: quote.customerId },
      select: { assignedRepId: true },
    });
    if (customer?.assignedRepId === actor.id) return;
    throw new ConflictError('You can only edit quotes you own or that belong to your assigned customers.');
  }
  // MANAGER/FINANCE/ADMIN have higher privileges.
}
