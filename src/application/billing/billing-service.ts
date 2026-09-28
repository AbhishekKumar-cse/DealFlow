// src/application/billing/billing-service.ts — Orchestrates hybrid billing
// for confirmed quotes: ONE_TIME quote lines become standalone invoices,
// RECURRING quote lines become a Subscription + a first-cycle recurring
// invoice. Also supports payments, credit notes, subscription cancel,
// and mid-cycle proration.
//
// Layered design:
//   domain/billing/calculator  → pure invoice math
//   domain/billing/proration   → calendar-aware proration
//   domain/billing/interval-helper → next billing date math
//   application/.../this file  → DB + audit + transactions
//   api/...                   → HTTP + RBAC
//
// Money is integer cents throughout. No decimal math.

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import type { Role, PlanInterval } from '@/lib/enums';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api-error';
import { calculateInvoice } from '@/domain/billing/calculator';
import { proratedAmount, daysInInterval } from '@/domain/billing/proration';
import { advanceDate } from '@/domain/billing/interval-helper';
import type { BillingLine } from '@/domain/billing/types';
import type { Prisma } from '@prisma/client';

export interface SessionActor {
  id: string;
  name: string;
  role: Role;
}

// ──────────────────────────────────────────────────────────────────────
// Number generators (INV-2026-0001 / CN-2026-0001 style, mirroring the
// quote number generator in quotation-service.ts).
// ──────────────────────────────────────────────────────────────────────

async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let next = 1;
  if (last) {
    const m = last.number.match(/INV-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function generateCreditNoteNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CN-${year}-`;
  const last = await tx.creditNote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let next = 1;
  if (last) {
    const m = last.number.match(/CN-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────
// generateInvoicesForQuote — the core hybrid billing entry point.
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate invoices + subscriptions for a CONFIRMED quote.
 *
 * Pipeline:
 *   1. Load the quote with its lines (must be CONFIRMED).
 *   2. In a single transaction:
 *        - For each ONE_TIME QuoteLine: create an Invoice (type=ONE_TIME,
 *          status=ISSUED, dueDate=issueDate+30 days) with one InvoiceLine.
 *        - For each RECURRING QuoteLine:
 *            a. Find or create a SubscriptionPlan matched by
 *               name=productName AND interval=line.interval.
 *            b. Create a Subscription (status=ACTIVE, startDate=now,
 *               nextBillingDate=advanceDate(startDate, interval,
 *               intervalCount)).
 *            c. Create a recurring Invoice (type=RECURRING,
 *               status=ISSUED) for the first cycle with one InvoiceLine
 *               linked to the subscription.
 *        - Update quote status to FULFILLING (billing done, awaiting
 *          fulfillment).
 *   3. Emit audit events `billing.invoice.create` (one per invoice) and
 *      `billing.subscription.create` (one per subscription).
 *   4. Return the list of created invoices + subscriptions.
 */
export async function generateInvoicesForQuote(
  quoteId: string,
  actor: SessionActor,
): Promise<{ invoices: any[]; subscriptions: any[] }> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  if (quote.status !== 'CONFIRMED') {
    throw new ConflictError(
      `Billing can only be generated for a CONFIRMED quote. This quote is ${quote.status}.`,
    );
  }
  if (quote.lines.length === 0) {
    throw new ConflictError('Cannot generate invoices for a quote with no lines.');
  }

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const taxPercent = quote.taxPercent;

  const createdInvoiceIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  await db.$transaction(async (tx) => {
    for (const line of quote.lines) {
      const grossCents = Math.round(line.qty * line.unitPriceCents);
      const discountCents = Math.round(
        (grossCents * line.discountPercent) / 100,
      );
      const netCents = grossCents - discountCents;

      if (line.billingType === 'ONE_TIME') {
        const billingLine: BillingLine = {
          productId: line.productId,
          productName: line.productName,
          billingType: 'ONE_TIME',
          qty: line.qty,
          unitPriceCents: line.unitPriceCents,
          discountPercent: line.discountPercent,
          netCents,
        };
        const totals = calculateInvoice([billingLine], taxPercent);
        const number = await generateInvoiceNumber(tx);
        const invoice = await tx.invoice.create({
          data: {
            number,
            customerId: quote.customerId,
            quoteId: quote.id,
            subscriptionId: null,
            type: 'ONE_TIME',
            status: 'ISSUED',
            issueDate,
            dueDate,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
            paidCents: 0,
            currency: quote.currency,
          },
        });
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            description: line.productName,
            qty: line.qty,
            unitPriceCents: line.unitPriceCents,
            discountPercent: line.discountPercent,
            grossCents,
            discountCents,
            netCents,
          },
        });
        createdInvoiceIds.push(invoice.id);
      } else if (line.billingType === 'RECURRING') {
        const interval = (line.interval ?? 'MONTHLY') as PlanInterval;
        const intervalCount = line.intervalCount ?? 1;
        const startDate = issueDate;
        const nextBillingDate = advanceDate(startDate, interval, intervalCount);

        // Find or create a SubscriptionPlan matched by name+interval.
        let plan = await tx.subscriptionPlan.findFirst({
          where: { name: line.productName, interval },
        });
        if (!plan) {
          plan = await tx.subscriptionPlan.create({
            data: {
              name: line.productName,
              interval,
              intervalCount,
              priceCents: line.unitPriceCents,
              active: true,
            },
          });
        }

        const subscription = await tx.subscription.create({
          data: {
            customerId: quote.customerId,
            quoteId: quote.id,
            planId: plan.id,
            productId: line.productId,
            priceCents: line.unitPriceCents,
            interval,
            intervalCount,
            qty: line.qty,
            status: 'ACTIVE',
            startDate,
            nextBillingDate,
          },
        });

        const billingLine: BillingLine = {
          productId: line.productId,
          productName: line.productName,
          billingType: 'RECURRING',
          qty: line.qty,
          unitPriceCents: line.unitPriceCents,
          discountPercent: line.discountPercent,
          netCents,
          interval,
          intervalCount,
        };
        const totals = calculateInvoice([billingLine], taxPercent);
        const number = await generateInvoiceNumber(tx);
        const invoice = await tx.invoice.create({
          data: {
            number,
            customerId: quote.customerId,
            quoteId: quote.id,
            subscriptionId: subscription.id,
            type: 'RECURRING',
            status: 'ISSUED',
            issueDate,
            dueDate,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
            paidCents: 0,
            currency: quote.currency,
          },
        });
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            description: line.productName,
            qty: line.qty,
            unitPriceCents: line.unitPriceCents,
            discountPercent: line.discountPercent,
            grossCents,
            discountCents,
            netCents,
          },
        });
        createdInvoiceIds.push(invoice.id);
        createdSubscriptionIds.push(subscription.id);
      } else {
        // Defensive — billingType is validated by Zod elsewhere.
        throw new ValidationError([
          {
            code: 'invalid_enum_value',
            path: ['billingType'],
            message: `Unknown billing type: ${line.billingType}`,
          },
        ]);
      }
    }

    // Update quote status to FULFILLING (billing done, awaiting fulfillment).
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: 'FULFILLING' },
    });
  });

  // Fetch the created rows for return + audit payload.
  const invoices = await db.invoice.findMany({
    where: { id: { in: createdInvoiceIds } },
    include: { lines: true, customer: { select: { id: true, name: true } } },
  });
  const subscriptions = await db.subscription.findMany({
    where: { id: { in: createdSubscriptionIds } },
    include: { plan: true, customer: { select: { id: true, name: true } } },
  });

  // Emit audit events.
  for (const inv of invoices) {
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      entityType: 'invoice',
      entityId: inv.id,
      quoteId,
      action: 'billing.invoice.create',
      newValue: {
        number: inv.number,
        type: inv.type,
        totalCents: inv.totalCents,
        customerId: inv.customerId,
      },
    });
  }
  for (const sub of subscriptions) {
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      entityType: 'subscription',
      entityId: sub.id,
      quoteId,
      action: 'billing.subscription.create',
      newValue: {
        planId: sub.planId,
        planName: sub.plan.name,
        priceCents: sub.priceCents,
        interval: sub.interval,
        intervalCount: sub.intervalCount,
        nextBillingDate: sub.nextBillingDate,
      },
    });
  }

  return { invoices, subscriptions };
}

// ──────────────────────────────────────────────────────────────────────
// listInvoices — paginated list with optional filters.
// ──────────────────────────────────────────────────────────────────────

export async function listInvoices(
  options: {
    page?: number;
    pageSize?: number;
    customerId?: string;
    status?: string;
    type?: string;
    search?: string;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.InvoiceWhereInput = {};
  if (options.customerId) where.customerId = options.customerId;
  if (options.status) where.status = options.status;
  if (options.type) where.type = options.type;
  if (options.search) where.number = { contains: options.search };

  const [total, data] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, tier: true } },
        quote: { select: { id: true, number: true } },
        subscription: {
          select: { id: true, plan: { select: { name: true } } },
        },
        _count: { select: { lines: true, payments: true, creditNotes: true } },
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

// ──────────────────────────────────────────────────────────────────────
// getInvoice — full invoice with lines + payments + credit notes.
// ──────────────────────────────────────────────────────────────────────

export async function getInvoice(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: { select: { id: true, name: true, tier: true } },
      quote: { select: { id: true, number: true } },
      subscription: {
        select: {
          id: true,
          plan: { select: { id: true, name: true } },
          status: true,
          interval: true,
          intervalCount: true,
        },
      },
      lines: true,
      payments: { orderBy: { createdAt: 'desc' } },
      creditNotes: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

// ──────────────────────────────────────────────────────────────────────
// listSubscriptions — paginated list (defaults to active only).
// ──────────────────────────────────────────────────────────────────────

export async function listSubscriptions(
  options: {
    page?: number;
    pageSize?: number;
    customerId?: string;
    status?: string;
    search?: string;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.SubscriptionWhereInput = {};
  if (options.customerId) where.customerId = options.customerId;
  // Default to ACTIVE only if no status filter is provided. The
  // sentinel value 'ALL' explicitly requests every status (used by
  // the UI's "All" filter dropdown).
  if (options.status && options.status !== 'ALL') {
    where.status = options.status;
  } else if (!options.status) {
    where.status = 'ACTIVE';
  }
  if (options.search) {
    where.OR = [
      { plan: { name: { contains: options.search } } },
      { customer: { name: { contains: options.search } } },
    ];
  }

  const [total, data] = await Promise.all([
    db.subscription.count({ where }),
    db.subscription.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, tier: true } },
        plan: { select: { id: true, name: true } },
        quote: { select: { id: true, number: true } },
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

// ──────────────────────────────────────────────────────────────────────
// recordPayment — record a payment against an invoice.
// ──────────────────────────────────────────────────────────────────────

export async function recordPayment(
  invoiceId: string,
  amountCents: number,
  method: string,
  reference: string | undefined,
  actor: SessionActor,
) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['amountCents'],
        message: 'Payment amount must be a positive integer (cents).',
      },
    ]);
  }

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'VOID') {
    throw new ConflictError('Cannot record a payment against a VOID invoice.');
  }
  if (invoice.status === 'PAID') {
    throw new ConflictError('Invoice is already fully paid.');
  }

  const updated = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        amountCents,
        method,
        reference: reference ?? null,
        status: 'COMPLETED',
      },
    });

    const newPaidCents = invoice.paidCents + amountCents;
    const newStatus =
      newPaidCents >= invoice.totalCents ? 'PAID' : 'PARTIAL';
    const refreshed = await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidCents: newPaidCents, status: newStatus },
      include: {
        customer: { select: { id: true, name: true } },
        lines: true,
      },
    });
    return { payment, invoice: refreshed };
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'invoice',
    entityId: invoiceId,
    quoteId: updated.invoice.quoteId ?? undefined,
    action: 'billing.payment.record',
    newValue: {
      paymentId: updated.payment.id,
      amountCents,
      method,
      reference: reference ?? null,
      newPaidCents: updated.invoice.paidCents,
      newStatus: updated.invoice.status,
    },
  });

  return updated.invoice;
}

// ──────────────────────────────────────────────────────────────────────
// issueCreditNote — issue a credit note against an invoice.
// ──────────────────────────────────────────────────────────────────────

export async function issueCreditNote(
  invoiceId: string,
  amountCents: number,
  reason: string,
  actor: SessionActor,
) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['amountCents'],
        message: 'Credit note amount must be a positive integer (cents).',
      },
    ]);
  }
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['reason'],
        message: 'A reason is required for credit notes.',
      },
    ]);
  }

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'VOID') {
    throw new ConflictError('Cannot issue a credit note against a VOID invoice.');
  }

  const updated = await db.$transaction(async (tx) => {
    const number = await generateCreditNoteNumber(tx);
    const creditNote = await tx.creditNote.create({
      data: {
        number,
        invoiceId,
        amountCents,
        reason,
      },
    });

    // Reduce the invoice total by the credit amount. If the customer
    // has already paid part/all of the invoice, the credit is applied
    // to the paidCents first (i.e. the credit represents a refund
    // obligation); any remainder reduces the outstanding balance.
    const newTotalCents = Math.max(0, invoice.totalCents - amountCents);
    const newPaidCents = Math.min(invoice.paidCents, newTotalCents);
    let newStatus = invoice.status;
    if (newTotalCents <= 0) newStatus = 'PAID';
    else if (newPaidCents >= newTotalCents) newStatus = 'PAID';
    else if (newPaidCents > 0) newStatus = 'PARTIAL';
    else newStatus = invoice.status === 'PAID' ? 'PAID' : invoice.status;

    const refreshed = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        totalCents: newTotalCents,
        paidCents: newPaidCents,
        status: newStatus,
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines: true,
      },
    });
    return { creditNote, invoice: refreshed };
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'creditNote',
    entityId: updated.creditNote.id,
    quoteId: updated.invoice.quoteId ?? undefined,
    action: 'billing.creditNote.issue',
    newValue: {
      number: updated.creditNote.number,
      invoiceId,
      amountCents,
      reason,
      newTotalCents: updated.invoice.totalCents,
      newPaidCents: updated.invoice.paidCents,
    },
    reason,
  });

  return updated.invoice;
}

// ──────────────────────────────────────────────────────────────────────
// cancelSubscription — mark a subscription CANCELLED.
// ──────────────────────────────────────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string,
  reason: string,
  actor: SessionActor,
) {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['reason'],
        message: 'A reason is required for cancelling a subscription.',
      },
    ]);
  }

  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) throw new NotFoundError('Subscription not found');
  if (subscription.status === 'CANCELLED') {
    throw new ConflictError('Subscription is already cancelled.');
  }
  if (subscription.status === 'EXPIRED') {
    throw new ConflictError('Cannot cancel an EXPIRED subscription.');
  }

  const now = new Date();
  // endDate is set to the next billing date — the customer keeps
  // service through the end of the current cycle.
  const endDate = subscription.nextBillingDate;

  const updated = await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      endDate,
    },
    include: {
      customer: { select: { id: true, name: true } },
      plan: { select: { id: true, name: true } },
    },
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'subscription',
    entityId: subscriptionId,
    quoteId: subscription.quoteId ?? undefined,
    action: 'billing.subscription.cancel',
    oldValue: { status: subscription.status, priceCents: subscription.priceCents },
    newValue: { status: 'CANCELLED', cancelledAt: now, endDate },
    reason,
  });

  return updated;
}

// ──────────────────────────────────────────────────────────────────────
// prorateSubscription — mid-cycle plan change with proration.
// ──────────────────────────────────────────────────────────────────────

/**
 * Switch a subscription to a new plan price mid-cycle.
 *
 * Pipeline:
 *   1. Load the subscription + its plan + the cycle bounds (startDate
 *      → nextBillingDate).
 *   2. Compute the remaining days in the current cycle from
 *      `effectiveDate` to `nextBillingDate`.
 *   3. Compute:
 *        - creditCents = proratedAmount(old cycle price × qty,
 *          remainingDays, cycleDays) — the unused portion of the
 *          customer's prepayment, as a NEGATIVE line on the new invoice.
 *        - chargeCents = proratedAmount(new cycle price × qty,
 *          remainingDays, cycleDays) — what they owe for the new plan
 *          for the remaining days, as a POSITIVE line.
 *   4. Create a PRORATED Invoice with two InvoiceLines (negative
 *      credit + positive charge).
 *   5. Update the subscription's priceCents to the new price; the
 *      nextBillingDate stays the same (the cycle boundary doesn't
 *      move).
 *   6. Emit `billing.subscription.prorate` audit event.
 */
export async function prorateSubscription(
  subscriptionId: string,
  newPlanPriceCents: number,
  effectiveDate: Date,
  actor: SessionActor,
) {
  if (!Number.isInteger(newPlanPriceCents) || newPlanPriceCents < 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['newPlanPriceCents'],
        message: 'New plan price must be a non-negative integer (cents).',
      },
    ]);
  }

  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, customer: { select: { id: true, name: true } } },
  });
  if (!subscription) throw new NotFoundError('Subscription not found');
  if (subscription.status !== 'ACTIVE') {
    throw new ConflictError(
      `Cannot prorate a ${subscription.status} subscription.`,
    );
  }

  const interval = subscription.interval as PlanInterval;
  const intervalCount = subscription.intervalCount;
  const cycleStart = subscription.startDate;
  const cycleEnd = subscription.nextBillingDate;
  const cycleDays = Math.max(
    1,
    Math.round(
      (cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  // daysInInterval uses the same math; using it for an independent
  // sanity check would be redundant — we use the actual cycle bounds
  // because startDate may have been adjusted by the application
  // service. (Kept the import for future cycle-length queries.)
  void daysInInterval;

  const remainingMs = cycleEnd.getTime() - effectiveDate.getTime();
  const remainingDays = Math.max(
    0,
    Math.round(remainingMs / (1000 * 60 * 60 * 24)),
  );

  const oldCycleCents = subscription.priceCents * subscription.qty;
  const newCycleCents = newPlanPriceCents * subscription.qty;

  const creditCents = proratedAmount({
    cyclePriceCents: oldCycleCents,
    cycleDays,
    remainingDays,
  });
  const chargeCents = proratedAmount({
    cyclePriceCents: newCycleCents,
    cycleDays,
    remainingDays,
  });

  const prorationPercent =
    cycleDays > 0
      ? Math.round((remainingDays / cycleDays) * 100)
      : 0;

  const issueDate = effectiveDate;
  const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const result = await db.$transaction(async (tx) => {
    const number = await generateInvoiceNumber(tx);
    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId: subscription.customerId,
        quoteId: subscription.quoteId,
        subscriptionId: subscription.id,
        type: 'PRORATED',
        status: 'ISSUED',
        issueDate,
        dueDate,
        // Compute totals via the pure calculator with two lines.
        subtotalCents: 0,
        discountCents: 0,
        taxCents: 0,
        totalCents: 0,
        paidCents: 0,
        currency: 'INR',
      },
    });

    // Negative line for the credit (unused portion of old plan).
    await tx.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        productId: subscription.productId,
        description: `Proration credit — unused ${subscription.plan.name} cycle`,
        qty: 1,
        unitPriceCents: -creditCents,
        discountPercent: 0,
        prorationPercent,
        grossCents: -creditCents,
        discountCents: 0,
        netCents: -creditCents,
      },
    });

    // Positive line for the new charge (remaining portion of new plan).
    await tx.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        productId: subscription.productId,
        description: `Proration charge — new plan (${subscription.plan.name})`,
        qty: 1,
        unitPriceCents: chargeCents,
        discountPercent: 0,
        prorationPercent,
        grossCents: chargeCents,
        discountCents: 0,
        netCents: chargeCents,
      },
    });

    // Recompute the invoice totals via the pure calculator.
    const billingLines: BillingLine[] = [
      {
        productId: subscription.productId,
        productName: subscription.plan.name,
        billingType: 'RECURRING',
        qty: 1,
        unitPriceCents: -creditCents,
        discountPercent: 0,
        netCents: -creditCents,
        interval,
        intervalCount,
      },
      {
        productId: subscription.productId,
        productName: subscription.plan.name,
        billingType: 'RECURRING',
        qty: 1,
        unitPriceCents: chargeCents,
        discountPercent: 0,
        netCents: chargeCents,
        interval,
        intervalCount,
      },
    ];
    const totals = calculateInvoice(billingLines, 0);
    const refreshed = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
      },
    });

    // Update the subscription's priceCents. nextBillingDate stays the
    // same (the cycle boundary doesn't move on a mid-cycle plan
    // change).
    const updatedSub = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { priceCents: newPlanPriceCents },
    });

    return { invoice: refreshed, subscription: updatedSub };
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'subscription',
    entityId: subscriptionId,
    quoteId: subscription.quoteId ?? undefined,
    action: 'billing.subscription.prorate',
    oldValue: { priceCents: subscription.priceCents },
    newValue: {
      priceCents: newPlanPriceCents,
      creditCents,
      chargeCents,
      netCents: chargeCents - creditCents,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.number,
      prorationPercent,
      effectiveDate,
    },
  });

  return result;
}

// ──────────────────────────────────────────────────────────────────────
// getBillingForQuote — summary used by QuoteDetailView's Billing card.
// ──────────────────────────────────────────────────────────────────────

export async function getBillingForQuote(quoteId: string) {
  const [invoices, subscriptions] = await Promise.all([
    db.invoice.findMany({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        payments: { orderBy: { createdAt: 'desc' } },
        creditNotes: { orderBy: { createdAt: 'desc' } },
        subscription: { select: { id: true, plan: { select: { name: true } } } },
      },
    }),
    db.subscription.findMany({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { id: true, name: true } },
      },
    }),
  ]);

  const totalInvoicedCents = invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalPaidCents = invoices.reduce((s, i) => s + i.paidCents, 0);
  const recurringRevenueCents = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((s, sub) => s + sub.priceCents * sub.qty, 0);

  return {
    invoices,
    subscriptions,
    summary: {
      invoiceCount: invoices.length,
      totalInvoicedCents,
      totalPaidCents,
      recurringRevenueCents,
    },
  };
}
