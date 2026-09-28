// src/domain/risk/risk-score-calculator.ts — Pure deterministic blended risk.
//
// Pipeline:
//   STEP 1 — per-line evaluation (overage, severity, revenue weight, margin factor)
//   STEP 2 — aggregate to a base score (weighted by revenue)
//   STEP 3 — apply configurable penalties (multi-violation, revenue
//            concentration, low margin, negotiation escalation, total discount)
//   STEP 4 — clamp to 0..100, classify into band
//   STEP 5 — build contributing factors + reasons + recommended action
//
// All thresholds and weights come from RiskConfigRow — no hardcoded constants.

import type {
  RiskConfigRow,
  LineEvaluationInput,
  LineEvaluationResult,
  RiskResult,
} from './types';
import type { RiskBand } from '@/lib/enums';

export function calculateRisk(
  lines: LineEvaluationInput[],
  config: RiskConfigRow,
  options: {
    /** Number of negotiation escalations by the customer on this quote (0 if none). */
    negotiationEscalations?: number;
    /** Total discount percent across the quote (0..100). */
    totalDiscountPct?: number;
  } = {},
): RiskResult {
  if (lines.length === 0) {
    return zero(config);
  }

  const totalNet = lines.reduce((s, l) => s + Math.max(0, l.netCents), 0);
  const totalGross = lines.reduce((s, l) => {
    return s + Math.max(0, Math.round(l.netCents / (1 - Math.min(0.99, l.requestedDiscountPercent / 100))));
  }, 0);
  const denominator = Math.max(1, totalNet);
  const minDen = Math.max(1, config.minDenominator);

  // STEP 1 — per-line.
  const lineEvaluations: LineEvaluationResult[] = lines.map((line) => {
    const overagePct = Math.max(0, line.requestedDiscountPercent - line.allowedDiscountPercent);
    const allowedBase = Math.max(line.allowedDiscountPercent, minDen);
    const discountSeverity = overagePct / allowedBase; // 0..~inf
    const revenueWeight = Math.max(0, line.netCents) / denominator; // 0..1
    const marginFactor = marginFactorFor(line.marginRatio, config);
    const raw = discountSeverity * revenueWeight * (marginFactor / 100);
    // Normalize raw into 0..100 contribution. discountSeverity > 1 is a major violation.
    const lineRiskContribution = clamp(Math.round(raw * 200), 0, 100);
    const violation = overagePct > 0;

    return {
      lineId: line.lineId,
      productName: line.productName,
      overagePct,
      discountSeverity,
      revenueWeight,
      marginFactor,
      lineRiskContribution,
      violation,
      ceiling: line.allowedDiscountPercent,
      requested: line.requestedDiscountPercent,
      reason: lineReason(line, overagePct),
    };
  });

  // STEP 2 — base score: weighted average of line contributions by revenue weight.
  const totalWeight = lineEvaluations.reduce((s, l) => s + l.revenueWeight, 0) || 1;
  let base = Math.round(
    lineEvaluations.reduce((s, l) => s + l.lineRiskContribution * l.revenueWeight, 0) /
      totalWeight,
  );

  // STEP 3 — penalties.
  const penalties: RiskResult['penalties'] = [];
  const violations = lineEvaluations.filter((l) => l.violation).length;
  if (violations >= 2) {
    base += config.multiViolationPenalty;
    penalties.push({ name: 'multi-violation', amount: config.multiViolationPenalty });
  }
  // High-revenue concentration: a single line > threshold % of total.
  const maxLineRevenuePct = Math.round(
    Math.max(...lineEvaluations.map((l) => l.revenueWeight)) * 100,
  );
  if (maxLineRevenuePct >= config.revenueConcentrationThreshold && violations > 0) {
    base += config.highRevenuePenalty;
    penalties.push({ name: 'high-revenue-concentration', amount: config.highRevenuePenalty });
  }
  // Low-margin penalty.
  const lowMarginLines = lines.filter((l) => l.marginRatio < config.marginLowThreshold).length;
  if (lowMarginLines > 0) {
    base += config.lowMarginPenalty;
    penalties.push({ name: 'low-margin', amount: config.lowMarginPenalty });
  }
  // Negotiation escalation penalty.
  if ((options.negotiationEscalations ?? 0) >= 1) {
    const penalty = config.negotiationEscalationPenalty * (options.negotiationEscalations ?? 1);
    base += penalty;
    penalties.push({ name: 'negotiation-escalation', amount: penalty });
  }
  // Total discount penalty.
  const totalDiscount = options.totalDiscountPct ?? 0;
  if (totalDiscount >= config.totalDiscountThreshold) {
    base += config.totalDiscountPenalty;
    penalties.push({ name: 'total-discount', amount: config.totalDiscountPenalty });
  }

  // STEP 4 — clamp + classify.
  const score = clamp(base, 0, 100);
  const band = classifyBand(score, config);

  // STEP 5 — explainability.
  const contributingFactors: string[] = [];
  const reasons: string[] = [];

  if (violations === 0) {
    contributingFactors.push('No lines breach their configured discount ceiling.');
    reasons.push('All discount requests are within policy.');
  } else {
    contributingFactors.push(`${violations} ${violations === 1 ? 'line breaches' : 'lines breach'} their discount ceiling.`);
    lineEvaluations
      .filter((l) => l.violation)
      .slice(0, 3)
      .forEach((l) => {
        reasons.push(
          `${l.productName} has a ${l.requested}% discount against a configured ${l.ceiling}% ceiling, creating a ${l.overagePct} percentage-point overage.`,
        );
      });
  }
  if (maxLineRevenuePct >= config.revenueConcentrationThreshold && violations > 0) {
    contributingFactors.push(`Discount exposure is concentrated on a single line (${maxLineRevenuePct}% of total).`);
  }
  if (lowMarginLines > 0) {
    contributingFactors.push(`${lowMarginLines} ${lowMarginLines === 1 ? 'line has' : 'lines have'} margin below ${config.marginLowThreshold}%.`);
  }
  if ((options.negotiationEscalations ?? 0) > 0) {
    contributingFactors.push(`Customer has escalated the discount ${options.negotiationEscalations} time(s).`);
  }
  if (totalDiscount >= config.totalDiscountThreshold) {
    contributingFactors.push(`Total quote discount is ${totalDiscount}% — above the ${config.totalDiscountThreshold}% review threshold.`);
  }

  const recommendedAction = recommendAction(band, violations);

  return {
    score,
    band,
    lineEvaluations,
    violations,
    contributingFactors,
    reasons,
    recommendedAction,
    penalties,
  };
}

function marginFactorFor(marginRatio: number, config: RiskConfigRow): number {
  if (marginRatio < config.marginLowThreshold) return config.marginFactorLow;
  return config.marginFactorHigh;
}

function classifyBand(score: number, config: RiskConfigRow): RiskBand {
  if (score <= config.safeMax) return 'SAFE';
  if (score <= config.reviewMax) return 'REVIEW';
  if (score <= config.managerMax) return 'MANAGER';
  return 'FINANCE';
}

function recommendAction(band: RiskBand, violations: number): string {
  if (band === 'SAFE') return 'Auto-approve. No action required.';
  if (band === 'REVIEW') return 'Send to sales manager for review.';
  if (band === 'MANAGER') return 'Send to sales manager for approval.';
  if (band === 'FINANCE') return `Send to finance for approval${violations > 0 ? ' — discount ceiling exceeded' : ''}.`;
  return 'Review.';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Build a human-readable per-line reason string. */
function lineReason(line: LineEvaluationInput, overagePct: number): string {
  if (overagePct <= 0) {
    if (line.requestedDiscountPercent === line.allowedDiscountPercent) {
      return `${line.productName} is at the configured ceiling (${line.allowedDiscountPercent}%).`;
    }
    return `${line.productName} discount (${line.requestedDiscountPercent}%) is within the ${line.allowedDiscountPercent}% ceiling.`;
  }
  return `${line.productName} has a ${line.requestedDiscountPercent}% discount against a configured ${line.allowedDiscountPercent}% ceiling, creating a ${overagePct} percentage-point overage.`;
}

function zero(config: RiskConfigRow): RiskResult {
  return {
    score: 0,
    band: 'SAFE',
    lineEvaluations: [],
    violations: 0,
    contributingFactors: ['Empty quote.'],
    reasons: ['Quote has no lines.'],
    recommendedAction: 'Add at least one line before submitting.',
    penalties: [],
  };
}
