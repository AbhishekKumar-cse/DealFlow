// src/application/dashboard/dashboard-service.ts
//
// Live Executive Dashboard — Phase 13.
//
// Computes role-scoped KPIs and chart datasets for the dashboard view.
// All values come from real database queries; no hardcoded metrics.
//
// Role scoping:
// - CUSTOMER          → only their own organization's quotes/subscriptions/invoices/fulfillment.
// - SALES_REP         → own quotes + quotes for customers assigned to them.
// - MANAGER/FINANCE/ADMIN → everything.
//
// Money is integer cents throughout. Percentages are decimal (0..100).

import { db } from '@/lib/db';
import type { Role } from '@/lib/enums';

export interface DashboardActor {
  id: string;
  role: Role;
  customerId?: string;
}

export interface DashboardKpis {
  pipelineValue: number; // cents
  openQuotes: number;
  pendingApprovals: number;
  atRiskDeals: number;
  projectedMarginPct: number; // decimal, e.g. 35.5
  avgDiscountPct: number; // decimal, e.g. 8.5
  fulfillmentIssues: number;
  mrr: number; // cents (monthly-equivalent recurring revenue)
}

export interface DashboardCharts {
  pipelineByStage: { stage: string; count: number }[];
  riskDistribution: { band: string; count: number }[];
  approvalAging: { bucket: string; count: number }[];
  discountDistribution: { bucket: string; count: number }[];
  fulfillmentState: { status: string; count: number }[];
  revenueMix: { recurring: number; oneTime: number }; // cents
}

export interface DashboardMetrics {
  kpis: DashboardKpis;
  charts: DashboardCharts;
}

// ────────────────────────────────────────────────────────────────────────────
// Status buckets
// ────────────────────────────────────────────────────────────────────────────

const PIPELINE_STATUSES = [
  'SUBMITTED',
  'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED',
  'CONFIRMED',
  'FULFILLING',
  'RETURNED',
] as const;

const OPEN_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED',
  'CONFIRMED',
  'FULFILLING',
  'RETURNED',
] as const;

const PIPELINE_STAGE_BUCKETS: { stage: string; statuses: string[] }[] = [
  { stage: 'Draft', statuses: ['DRAFT'] },
  { stage: 'In Review', statuses: ['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'] },
  { stage: 'Approved', statuses: ['APPROVED'] },
  { stage: 'In Fulfillment', statuses: ['CONFIRMED', 'FULFILLING'] },
  { stage: 'Fulfilled', statuses: ['FULFILLED'] },
];

const RISK_BAND_BUCKETS = ['SAFE', 'REVIEW', 'MANAGER', 'FINANCE'] as const;

const APPROVAL_AGING_BUCKETS = ['0–24h', '24–48h', '48–72h', '72h+'] as const;

const DISCOUNT_BUCKETS = ['0–5%', '5–10%', '10–15%', '15–20%', '20%+'] as const;

const FULFILLMENT_BUCKETS = ['FULFILLING', 'FULFILLED', 'PARTIAL', 'BACKORDERED'] as const;

// ────────────────────────────────────────────────────────────────────────────
// Role scoping helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Prisma `Quote` where filter that scopes quotes to what the actor
 * may see. `undefined` means "no filter" (apply nothing → all rows). For
 * CUSTOMER with no `customerId`, returns an always-false filter so nothing
 * leaks.
 */
function scopeQuote(actor: DashboardActor): any {
  if (actor.role === 'CUSTOMER') {
    if (!actor.customerId) return { id: '' };
    return { customerId: actor.customerId };
  }
  if (actor.role === 'SALES_REP') {
    return {
      OR: [
        { ownerId: actor.id },
        { customer: { assignedRepId: actor.id } },
      ],
    };
  }
  return undefined;
}

/**
 * Returns a Prisma `Customer` where filter (used as a relation filter on
 * invoices / subscriptions). Same scoping rules as `scopeQuote` but on the
 * customer side: SALES_REP sees customers they're assigned to OR have any
 * quote they own.
 */
function scopeCustomer(actor: DashboardActor): any {
  if (actor.role === 'CUSTOMER') {
    if (!actor.customerId) return { id: '' };
    return { id: actor.customerId };
  }
  if (actor.role === 'SALES_REP') {
    return {
      OR: [
        { assignedRepId: actor.id },
        { quotes: { some: { ownerId: actor.id } } },
      ],
    };
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Bucket helpers
// ────────────────────────────────────────────────────────────────────────────

function approvalAgeBucket(ageHours: number): number {
  if (ageHours < 24) return 0;
  if (ageHours < 48) return 1;
  if (ageHours < 72) return 2;
  return 3;
}

function discountBucket(pct: number): number {
  if (pct < 5) return 0;
  if (pct < 10) return 1;
  if (pct < 15) return 2;
  if (pct < 20) return 3;
  return 4;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyMetrics(): DashboardMetrics {
  return {
    kpis: {
      pipelineValue: 0,
      openQuotes: 0,
      pendingApprovals: 0,
      atRiskDeals: 0,
      projectedMarginPct: 0,
      avgDiscountPct: 0,
      fulfillmentIssues: 0,
      mrr: 0,
    },
    charts: {
      pipelineByStage: PIPELINE_STAGE_BUCKETS.map((b) => ({ stage: b.stage, count: 0 })),
      riskDistribution: RISK_BAND_BUCKETS.map((band) => ({ band, count: 0 })),
      approvalAging: APPROVAL_AGING_BUCKETS.map((bucket) => ({ bucket, count: 0 })),
      discountDistribution: DISCOUNT_BUCKETS.map((bucket) => ({ bucket, count: 0 })),
      fulfillmentState: FULFILLMENT_BUCKETS.map((status) => ({ status, count: 0 })),
      revenueMix: { recurring: 0, oneTime: 0 },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: getDashboardMetrics
// ────────────────────────────────────────────────────────────────────────────

export async function getDashboardMetrics(
  actor: DashboardActor,
): Promise<DashboardMetrics> {
  // Edge case: customer with no organization → return empty metrics (no leak).
  if (actor.role === 'CUSTOMER' && !actor.customerId) {
    return emptyMetrics();
  }

  const quoteScope = scopeQuote(actor);
  const customerScope = scopeCustomer(actor);

  // Build the where clauses once. `...(quoteScope ?? {})` is a no-op when
  // the scope is `undefined` (MANAGER/FINANCE/ADMIN see all).
  const pipelineWhere: any = {
    status: { in: PIPELINE_STATUSES as unknown as string[] },
    ...(quoteScope ?? {}),
  };
  const openQuotesWhere: any = {
    status: { in: OPEN_STATUSES as unknown as string[] },
    ...(quoteScope ?? {}),
  };
  const submittedWhere: any = {
    submittedAt: { not: null },
    ...(quoteScope ?? {}),
  };
  const riskBandWhere: any = {
    status: { notIn: ['DRAFT', 'CANCELLED'] },
    riskBand: { not: null },
    ...(quoteScope ?? {}),
  };
  const quoteAllWhere: any = { ...(quoteScope ?? {}) };

  // Relation-scoped where clauses (approvals / health / fulfillment).
  const approvalPendingWhere: any = { status: 'PENDING' };
  if (quoteScope) approvalPendingWhere.quote = quoteScope;

  const healthEventWhere: any = { status: 'OPEN' };
  if (quoteScope) healthEventWhere.quote = quoteScope;

  const fulfillmentBaseWhere: any = {};
  if (quoteScope) fulfillmentBaseWhere.quote = quoteScope;

  const fulfillmentIssuesWhere: any = {
    ...(quoteScope ? { quote: quoteScope } : {}),
    OR: [
      { status: { in: ['PARTIAL', 'BACKORDERED'] } },
      { backorders: { some: { resolvedAt: null } } },
    ],
  };

  // Invoice / subscription (customer-scoped).
  const oneTimeInvoiceWhere: any = {
    status: { notIn: ['DRAFT', 'VOID'] },
    type: 'ONE_TIME',
    ...(customerScope ? { customer: customerScope } : {}),
  };
  const subscriptionWhere: any = {
    status: 'ACTIVE',
    ...(customerScope ? { customer: customerScope } : {}),
  };

  // ── Run all the queries in parallel. ────────────────────────────────────
  const [
    pipelineSum,
    openQuotesCount,
    pendingApprovalsCount,
    pipelineMarginSum,
    submittedQuotes,
    atRiskByBand,
    atRiskByEvent,
    approvalAgingRows,
    fulfillmentIssuesCount,
    fulfillmentStateGroups,
    riskBandGroups,
    pipelineStageGroups,
    activeSubscriptions,
    oneTimeInvoiceSum,
  ] = await Promise.all([
    // 1. Pipeline Value (sum of totalCents across pipeline quotes).
    db.quote.aggregate({
      where: pipelineWhere,
      _sum: { totalCents: true },
    }),
    // 2. Open Quotes.
    db.quote.count({ where: openQuotesWhere }),
    // 3. Pending Approvals.
    db.approvalRequest.count({ where: approvalPendingWhere }),
    // 4. Projected Margin (sum subtotal + cost across pipeline quotes).
    db.quote.aggregate({
      where: pipelineWhere,
      _sum: { subtotalCents: true, estimatedCostCents: true },
    }),
    // 5. Submitted quotes (for avg discount + discount distribution).
    db.quote.findMany({
      where: submittedWhere,
      select: { subtotalCents: true, discountCents: true },
    }),
    // 6. At-Risk: quotes with riskBand in MANAGER/FINANCE.
    db.quote.findMany({
      where: { ...quoteAllWhere, riskBand: { in: ['MANAGER', 'FINANCE'] } },
      select: { id: true },
    }),
    // 7. At-Risk: quotes with open DealHealthEvent (deduped in code).
    db.dealHealthEvent.findMany({
      where: healthEventWhere,
      select: { quoteId: true },
    }),
    // 8. Approval Aging (PENDING approvals with createdAt).
    db.approvalRequest.findMany({
      where: approvalPendingWhere,
      select: { createdAt: true },
    }),
    // 9. Fulfillment Issues (status PARTIAL/BACKORDERED or has unresolved backorders).
    db.fulfillmentOrder.count({ where: fulfillmentIssuesWhere }),
    // 10. Fulfillment State (group by status).
    db.fulfillmentOrder.groupBy({
      by: ['status'],
      where: fulfillmentBaseWhere,
      _count: { _all: true },
    }),
    // 11. Risk Distribution (group by riskBand).
    db.quote.groupBy({
      by: ['riskBand'],
      where: riskBandWhere,
      _count: { _all: true },
    }),
    // 12. Pipeline by Stage (group by status).
    db.quote.groupBy({
      by: ['status'],
      where: quoteAllWhere,
      _count: { _all: true },
    }),
    // 13. Active Subscriptions (MRR).
    db.subscription.findMany({
      where: subscriptionWhere,
      select: { priceCents: true, interval: true, intervalCount: true, qty: true },
    }),
    // 14. One-time invoice sum (issued invoices of type ONE_TIME).
    db.invoice.aggregate({
      where: oneTimeInvoiceWhere,
      _sum: { totalCents: true },
    }),
  ]);

  // ── Compute the KPIs. ──────────────────────────────────────────────────

  const pipelineValue = pipelineSum._sum.totalCents ?? 0;

  const totalSubtotal = pipelineMarginSum._sum.subtotalCents ?? 0;
  const totalCost = pipelineMarginSum._sum.estimatedCostCents ?? 0;
  const projectedMarginPct =
    totalSubtotal > 0
      ? ((totalSubtotal - totalCost) / totalSubtotal) * 100
      : 0;

  const submittedCount = submittedQuotes.length;
  const avgDiscountPct =
    submittedCount > 0
      ? submittedQuotes.reduce((s, q) => {
          const pct =
            q.subtotalCents > 0
              ? (q.discountCents / q.subtotalCents) * 100
              : 0;
          return s + pct;
        }, 0) / submittedCount
      : 0;

  // At-Risk: union of (riskBand in MANAGER/FINANCE) and (open health event).
  const atRiskSet = new Set<string>();
  for (const q of atRiskByBand) atRiskSet.add(q.id);
  for (const e of atRiskByEvent) atRiskSet.add(e.quoteId);
  const atRiskDeals = atRiskSet.size;

  // MRR — normalize all active subscriptions to a monthly equivalent.
  // MONTHLY contributes price*qty; QUARTERLY price/intervalCount/3*qty;
  // ANNUAL price/intervalCount/12*qty.
  const mrr = activeSubscriptions.reduce((sum, s) => {
    const intervalCount =
      s.intervalCount && s.intervalCount > 0 ? s.intervalCount : 1;
    const qty = s.qty && s.qty > 0 ? s.qty : 1;
    let monthly = 0;
    if (s.interval === 'MONTHLY') {
      monthly = s.priceCents;
    } else if (s.interval === 'QUARTERLY') {
      monthly = Math.round(s.priceCents / intervalCount / 3);
    } else if (s.interval === 'ANNUAL') {
      monthly = Math.round(s.priceCents / intervalCount / 12);
    }
    return sum + monthly * qty;
  }, 0);

  const oneTime = oneTimeInvoiceSum._sum.totalCents ?? 0;

  // ── Compute the chart datasets. ──────────────────────────────────────

  // Approval Aging histogram.
  const approvalAging = APPROVAL_AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: 0,
  }));
  const nowMs = Date.now();
  for (const r of approvalAgingRows) {
    const ageHours = (nowMs - r.createdAt.getTime()) / (1000 * 60 * 60);
    const idx = approvalAgeBucket(ageHours);
    approvalAging[idx].count += 1;
  }

  // Discount Distribution histogram.
  const discountDistribution = DISCOUNT_BUCKETS.map((bucket) => ({
    bucket,
    count: 0,
  }));
  for (const q of submittedQuotes) {
    const pct =
      q.subtotalCents > 0 ? (q.discountCents / q.subtotalCents) * 100 : 0;
    const idx = discountBucket(pct);
    discountDistribution[idx].count += 1;
  }

  // Risk Distribution (4 fixed bands in order).
  const riskMap = new Map<string, number>();
  for (const g of riskBandGroups) {
    if (g.riskBand) riskMap.set(g.riskBand, g._count._all);
  }
  const riskDistribution = RISK_BAND_BUCKETS.map((band) => ({
    band,
    count: riskMap.get(band) ?? 0,
  }));

  // Pipeline by Stage (5 fixed buckets, statuses rolled up).
  const stageMap = new Map<string, number>();
  for (const g of pipelineStageGroups) {
    stageMap.set(g.status, g._count._all);
  }
  const pipelineByStage = PIPELINE_STAGE_BUCKETS.map((b) => ({
    stage: b.stage,
    count: b.statuses.reduce((s, st) => s + (stageMap.get(st) ?? 0), 0),
  }));

  // Fulfillment State (4 fixed statuses in order).
  const fulfillmentMap = new Map<string, number>();
  for (const g of fulfillmentStateGroups) {
    fulfillmentMap.set(g.status, g._count._all);
  }
  const fulfillmentState = FULFILLMENT_BUCKETS.map((status) => ({
    status,
    count: fulfillmentMap.get(status) ?? 0,
  }));

  return {
    kpis: {
      pipelineValue,
      openQuotes: openQuotesCount,
      pendingApprovals: pendingApprovalsCount,
      atRiskDeals,
      projectedMarginPct: round1(projectedMarginPct),
      avgDiscountPct: round1(avgDiscountPct),
      fulfillmentIssues: fulfillmentIssuesCount,
      mrr,
    },
    charts: {
      pipelineByStage,
      riskDistribution,
      approvalAging,
      discountDistribution,
      fulfillmentState,
      revenueMix: {
        recurring: mrr,
        oneTime,
      },
    },
  };
}
