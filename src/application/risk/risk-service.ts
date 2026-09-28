// src/application/risk/risk-service.ts — Evaluate a quote's risk using the
// pure risk engine.

import { db } from '@/lib/db';
import { resolveDiscountRule } from '@/domain/risk/discount-policy-resolver';
import { calculateRisk } from '@/domain/risk/risk-score-calculator';
import type { LineEvaluationInput, RiskConfigRow, RiskResult } from '@/domain/risk/types';
import type { CustomerTier, RiskBand } from '@/lib/enums';
import { getOrCreateRiskConfig } from '@/app/api/risk-config/route';

export interface EvaluateQuoteRiskResult extends RiskResult {
  snapshot: {
    score: number;
    band: RiskBand;
    lineEvaluations: RiskResult['lineEvaluations'];
    violations: number;
    penalties: RiskResult['penalties'];
    reasons: string[];
    contributingFactors: string[];
    recommendedAction: string;
  };
}

export async function evaluateQuoteRisk(
  quoteId: string,
  options: { negotiationEscalations?: number; persist?: boolean } = {},
): Promise<EvaluateQuoteRiskResult> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      lines: { include: { product: true } },
      customer: true,
    },
  });
  if (!quote) throw new Error('Quote not found');

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

  const rules = await db.discountRule.findMany({ where: { active: true } });
  const customerTier = (quote.customer.tier as CustomerTier) ?? null;

  const lineInputs: LineEvaluationInput[] = quote.lines.map((l) => {
    const resolved = resolveDiscountRule(rules as any, {
      productId: l.productId,
      categoryId: l.product.categoryId,
      customerTier,
    });
    const gross = l.grossCents;
    const marginRatio = gross > 0 ? Math.round((l.marginCents ?? 0) * 100 / gross) : 0;
    return {
      lineId: l.id,
      productName: l.productName,
      categoryId: l.product.categoryId,
      productId: l.productId,
      customerTier,
      requestedDiscountPercent: l.discountPercent,
      allowedDiscountPercent: resolved.allowedPercent,
      netCents: l.netCents,
      marginRatio,
    };
  });

  const totalDiscountPct =
    quote.subtotalCents > 0
      ? Math.round((quote.discountCents / quote.subtotalCents) * 100)
      : 0;

  const result = calculateRisk(lineInputs, config, {
    negotiationEscalations: options.negotiationEscalations ?? 0,
    totalDiscountPct,
  });

  if (options.persist !== false) {
    await db.$transaction([
      db.quote.update({
        where: { id: quoteId },
        data: {
          riskScore: result.score,
          riskBand: result.band,
          riskSnapshot: JSON.stringify(result),
        },
      }),
      ...lineInputs.map((l) =>
        db.quoteLine.update({
          where: { id: l.lineId },
          data: { allowedDiscountPercent: l.allowedDiscountPercent },
        }),
      ),
    ]);
  }

  return { ...result, snapshot: snapshotOf(result) };
}

function snapshotOf(r: RiskResult): EvaluateQuoteRiskResult['snapshot'] {
  return {
    score: r.score,
    band: r.band,
    lineEvaluations: r.lineEvaluations,
    violations: r.violations,
    penalties: r.penalties,
    reasons: r.reasons,
    contributingFactors: r.contributingFactors,
    recommendedAction: r.recommendedAction,
  };
}
