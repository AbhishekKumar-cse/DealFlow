// src/application/deal-health/health-service.ts

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import { notifyRole } from '@/services/notifications/notify';
import { runAllDetectors } from '@/domain/deal-health/detectors';
import type { HealthConfigRow, QuoteContext } from '@/domain/deal-health/types';
import type { Role } from '@/lib/enums';
import { NotFoundError } from '@/lib/api-error';

export interface SessionActor {
  id: string;
  name: string;
  role: Role;
}

export async function getOrCreateHealthConfig() {
  let config = await db.dealHealthConfig.findFirst({ where: { active: true } });
  if (!config) {
    config = await db.dealHealthConfig.create({ data: { name: 'default', active: true } });
  }
  return config;
}

function toConfigRow(c: any): HealthConfigRow {
  return {
    stalledDaysThreshold: c.stalledDaysThreshold,
    approvalSlaHours: c.approvalSlaHours,
    deliverySlippageDays: c.deliverySlippageDays,
    discountAnomalyPpThreshold: c.discountAnomalyPpThreshold,
    marginDeteriorationThreshold: c.marginDeteriorationThreshold,
    negotiationEscalationCount: c.negotiationEscalationCount,
  };
}

export async function runHealthCheck(quoteId: string, _actor?: SessionActor) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      approvals: { select: { id: true, status: true, createdAt: true, resolvedAt: true } },
      fulfillmentOrders: {
        include: {
          backorders: { select: { id: true, resolvedAt: true, shortQty: true } },
        },
      },
      negotiations: { select: { id: true, status: true, createdAt: true } },
    },
  });
  if (!quote) throw new NotFoundError('Quote not found');

  // Historical avg discount for the customer across CONFIRMED/FULFILLED quotes.
  const historical = await db.quote.findMany({
    where: {
      customerId: quote.customerId,
      status: { in: ['CONFIRMED', 'FULFILLED'] },
      id: { not: quote.id },
    },
    select: { subtotalCents: true, discountCents: true },
  });
  const historicalAvgDiscountPct =
    historical.length === 0
      ? null
      : Math.round(
          historical.reduce((s, q) => {
            return s + (q.subtotalCents > 0 ? (q.discountCents / q.subtotalCents) * 100 : 0);
          }, 0) / historical.length,
        );

  const ctx: QuoteContext = {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    createdAt: quote.createdAt.toISOString(),
    expectedDeliveryDate: quote.expectedDeliveryDate?.toISOString() ?? null,
    totalDiscountPct:
      quote.subtotalCents > 0
        ? Math.round((quote.discountCents / quote.subtotalCents) * 100)
        : 0,
    marginPct: quote.estimatedMarginPct,
    customer: { id: quote.customer.id, name: quote.customer.name, tier: quote.customer.tier },
    approvalRequests: quote.approvals.map((a: any) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    })),
    fulfillmentOrders: quote.fulfillmentOrders.map((fo: any) => ({
      id: fo.id,
      status: fo.status,
      backorders: fo.backorders.map((b: any) => ({
        id: b.id,
        resolvedAt: b.resolvedAt?.toISOString() ?? null,
        shortQty: b.shortQty,
      })),
    })),
    negotiations: quote.negotiations.map((n: any) => ({
      id: n.id,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    })),
    historicalAvgDiscountPct,
  };

  const configRow = await getOrCreateHealthConfig();
  const cfg = toConfigRow(configRow);
  const results = runAllDetectors(ctx, cfg);

  // Persist new events (de-duplicate by type+quoteId+OPEN).
  const existingOpen = await db.dealHealthEvent.findMany({
    where: { quoteId, status: 'OPEN' },
    select: { type: true, id: true },
  });
  const openTypes = new Set(existingOpen.map((e) => e.type));
  const created: any[] = [];
  for (const r of results) {
    if (openTypes.has(r.type)) continue;
    const ev = await db.dealHealthEvent.create({
      data: {
        quoteId,
        type: r.type,
        severity: r.severity,
        evidence: r.evidence,
        recommendedAction: r.recommendedAction,
        status: 'OPEN',
      },
    });
    created.push(ev);

    // Notify managers/finance on CRITICAL alerts.
    if (r.severity === 'CRITICAL') {
      await notifyRole('SALES_MANAGER', {
        type: 'health.alert',
        title: `Critical alert: ${r.type.replace(/_/g, ' ')} on ${ctx.number}`,
        body: r.evidence,
        link: 'dashboard',
      });
      await notifyRole('FINANCE_OPERATIONS', {
        type: 'health.alert',
        title: `Critical alert: ${r.type.replace(/_/g, ' ')} on ${ctx.number}`,
        body: r.evidence,
        link: 'dashboard',
      });
    }
  }

  return { results, created };
}

export async function runHealthCheckForAllOpenQuotes() {
  const quotes = await db.quote.findMany({
    where: {
      status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED', 'FULFILLED'] },
    },
    select: { id: true },
  });
  let totalCreated = 0;
  for (const q of quotes) {
    try {
      const res = await runHealthCheck(q.id);
      totalCreated += res.created.length;
    } catch (err) {
      console.error('[health] run failed for', q.id, err);
    }
  }
  return { checked: quotes.length, created: totalCreated };
}

export async function listHealthEvents(filters: {
  status?: string;
  severity?: string;
  quoteId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.quoteId) where.quoteId = filters.quoteId;

  const [total, data] = await Promise.all([
    db.dealHealthEvent.count({ where }),
    db.dealHealthEvent.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        quote: {
          select: {
            id: true,
            number: true,
            customer: { select: { id: true, name: true, tier: true } },
          },
        },
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

export async function acknowledgeEvent(eventId: string, actor: SessionActor) {
  const updated = await db.dealHealthEvent.update({
    where: { id: eventId },
    data: { status: 'ACK' },
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'healthEvent',
    entityId: eventId,
    quoteId: updated.quoteId,
    action: 'health.ack',
    newValue: { type: updated.type, severity: updated.severity },
  });
  return updated;
}

export async function resolveEvent(eventId: string, actor: SessionActor) {
  const updated = await db.dealHealthEvent.update({
    where: { id: eventId },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'healthEvent',
    entityId: eventId,
    quoteId: updated.quoteId,
    action: 'health.resolve',
    newValue: { type: updated.type, severity: updated.severity },
  });
  return updated;
}

export async function updateHealthConfig(patch: any, actor: SessionActor) {
  const existing = await getOrCreateHealthConfig();
  const updated = await db.dealHealthConfig.update({
    where: { id: existing.id },
    data: patch,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'healthConfig',
    entityId: updated.id,
    action: 'health.config.update',
    oldValue: existing,
    newValue: updated,
  });
  return updated;
}
