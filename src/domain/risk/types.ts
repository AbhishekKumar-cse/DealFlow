// src/domain/risk/types.ts — Shared risk domain types.

import type { CustomerTier, RiskBand } from '@/lib/enums';

export interface DiscountRuleRow {
  id: string;
  name: string;
  customerTier: CustomerTier | null;
  categoryId: string | null;
  productId: string | null;
  maxPercent: number;
  warnPercent: number | null;
  priority: number;
  active: boolean;
}

export interface RiskConfigRow {
  safeMax: number;
  reviewMax: number;
  managerMax: number;
  marginFactorLow: number;
  marginFactorHigh: number;
  marginLowThreshold: number;
  revenueConcentrationThreshold: number;
  multiViolationPenalty: number;
  highRevenuePenalty: number;
  lowMarginPenalty: number;
  negotiationEscalationPenalty: number;
  totalDiscountPenalty: number;
  totalDiscountThreshold: number;
  minDenominator: number;
}

export interface LineEvaluationInput {
  lineId: string;
  productName: string;
  categoryId: string | null;
  productId: string;
  customerTier: CustomerTier | null;
  requestedDiscountPercent: number;
  allowedDiscountPercent: number;
  /** Net value (gross - discount) in cents. */
  netCents: number;
  /** Gross margin ratio 0..100 — line net / line gross (or 0). */
  marginRatio: number;
}

export interface LineEvaluationResult {
  lineId: string;
  productName: string;
  overagePct: number;
  discountSeverity: number;
  revenueWeight: number;
  marginFactor: number;
  lineRiskContribution: number;
  violation: boolean;
  ceiling: number;
  requested: number;
  reason: string;
}

export interface RiskResult {
  score: number; // 0..100
  band: RiskBand;
  lineEvaluations: LineEvaluationResult[];
  violations: number;
  contributingFactors: string[];
  reasons: string[];
  recommendedAction: string;
  penalties: { name: string; amount: number }[];
}
