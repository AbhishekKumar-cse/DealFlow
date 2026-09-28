// src/domain/deal-health/detectors.ts — Pure deterministic anomaly detectors.
// All thresholds come from HealthConfigRow. No machine learning.

import type { DetectorResult, HealthConfigRow, QuoteContext } from './types';
import type { HealthEventType, HealthSeverity } from '@/lib/enums';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function detectStalled(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  if (ctx.status !== 'PENDING_MANAGER' && ctx.status !== 'PENDING_FINANCE') return [];
  const ageDays = (Date.now() - new Date(ctx.createdAt).getTime()) / MS_PER_DAY;
  if (ageDays <= cfg.stalledDaysThreshold) return [];
  return [
    {
      type: 'STALLED',
      severity: 'WARN',
      evidence: `Quote has been in ${ctx.status.replace('_', ' ')} for ${Math.round(ageDays)} days (threshold: ${cfg.stalledDaysThreshold}).`,
      recommendedAction: 'Follow up with the assigned approver or reassign.',
    },
  ];
}

export function detectApprovalSla(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  const out: DetectorResult[] = [];
  for (const req of ctx.approvalRequests) {
    if (req.status !== 'PENDING') continue;
    const ageHours = (Date.now() - new Date(req.createdAt).getTime()) / MS_PER_HOUR;
    if (ageHours <= cfg.approvalSlaHours) continue;
    out.push({
      type: 'APPROVAL_SLA_BREACH',
      severity: ageHours > cfg.approvalSlaHours * 2 ? 'CRITICAL' : 'WARN',
      evidence: `Approval request has been pending for ${Math.round(ageHours)}h (SLA: ${cfg.approvalSlaHours}h).`,
      recommendedAction: 'Escalate to the required approver immediately.',
    });
  }
  return out;
}

export function detectDeliverySlippage(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  if (!ctx.expectedDeliveryDate) return [];
  if (ctx.status === 'FULFILLED') return [];
  const expected = new Date(ctx.expectedDeliveryDate).getTime();
  const slipDays = Math.round((Date.now() - expected) / MS_PER_DAY);
  if (slipDays < cfg.deliverySlippageDays) return [];
  return [
    {
      type: 'DELIVERY_SLIPPAGE',
      severity: slipDays > cfg.deliverySlippageDays * 2 ? 'CRITICAL' : 'WARN',
      evidence: `Expected delivery was ${slipDays} day(s) ago; quote is still ${ctx.status.replace('_', ' ')}.`,
      recommendedAction: 'Verify fulfillment status and notify the customer of a revised date.',
    },
  ];
}

export function detectDiscountAnomaly(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  if (ctx.historicalAvgDiscountPct == null) return [];
  const overage = ctx.totalDiscountPct - ctx.historicalAvgDiscountPct;
  if (overage < cfg.discountAnomalyPpThreshold) return [];
  return [
    {
      type: 'DISCOUNT_ANOMALY',
      severity: overage > cfg.discountAnomalyPpThreshold * 2 ? 'CRITICAL' : 'WARN',
      evidence: `Current total discount (${ctx.totalDiscountPct}%) is ${overage}pp above the customer's historical average (${ctx.historicalAvgDiscountPct}%).`,
      recommendedAction: 'Review with the sales rep — confirm the discount is justified.',
    },
  ];
}

export function detectMarginDeterioration(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  if (ctx.marginPct >= cfg.marginDeteriorationThreshold) return [];
  const severity: HealthSeverity = ctx.marginPct < 10 ? 'CRITICAL' : 'WARN';
  return [
    {
      type: 'MARGIN_DETERIORATION',
      severity,
      evidence: `Quote margin is ${ctx.marginPct}% (threshold: ${cfg.marginDeteriorationThreshold}%).`,
      recommendedAction: 'Renegotiate pricing or reduce discounts.',
    },
  ];
}

export function detectNegotiationEscalation(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  const activeNegotiations = ctx.negotiations.filter(
    (n) => n.status === 'OPEN' || n.status === 'ACCEPTED',
  );
  if (activeNegotiations.length < cfg.negotiationEscalationCount) return [];
  return [
    {
      type: 'NEGOTIATION_ESCALATION',
      severity: 'WARN',
      evidence: `Customer has ${activeNegotiations.length} active negotiation(s) on this quote.`,
      recommendedAction: 'Engage the customer directly to converge on terms.',
    },
  ];
}

export function detectBackorder(ctx: QuoteContext, _cfg: HealthConfigRow): DetectorResult[] {
  for (const fo of ctx.fulfillmentOrders) {
    const unresolved = fo.backorders.filter((b) => !b.resolvedAt);
    if (unresolved.length > 0) {
      const totalShort = unresolved.reduce((s, b) => s + b.shortQty, 0);
      return [
        {
          type: 'BACKORDER',
          severity: 'WARN',
          evidence: `Fulfillment order has ${unresolved.length} backorder line(s) totaling ${totalShort} units.`,
          recommendedAction: 'Replenish stock or split-source from another warehouse.',
        },
      ];
    }
  }
  return [];
}

export function runAllDetectors(ctx: QuoteContext, cfg: HealthConfigRow): DetectorResult[] {
  return [
    ...detectStalled(ctx, cfg),
    ...detectApprovalSla(ctx, cfg),
    ...detectDeliverySlippage(ctx, cfg),
    ...detectDiscountAnomaly(ctx, cfg),
    ...detectMarginDeterioration(ctx, cfg),
    ...detectNegotiationEscalation(ctx, cfg),
    ...detectBackorder(ctx, cfg),
  ];
}
