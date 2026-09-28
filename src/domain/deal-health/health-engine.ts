// src/domain/deal-health/health-engine.ts — Orchestrator that runs every
// detector against a single QuoteContext and returns the combined list of
// DetectorResults.
//
// Pure function — no I/O, no side effects, no database calls. The
// application service layer is responsible for building the QuoteContext
// (loading the quote + related rows from the DB) and for persisting the
// resulting DealHealthEvent rows (with de-duplication).

import type {
  HealthConfigRow,
  QuoteContext,
  DetectorResult,
} from './types';
import {
  detectStalled,
  detectApprovalSla,
  detectDeliverySlippage,
  detectDiscountAnomaly,
  detectMarginDeterioration,
  detectNegotiationEscalation,
  detectBackorder,
} from './detectors';

/**
 * Run every detector against a single QuoteContext.
 *
 * Detectors are called in a fixed, deterministic order — the same as the
 * order they are documented in the spec — so the resulting DetectorResult[]
 * list is stable across runs (matters for the UI and for diffing). Each
 * detector returns either [] or [one event]; this function concatenates.
 */
export function runAllDetectors(
  ctx: QuoteContext,
  cfg: HealthConfigRow,
): DetectorResult[] {
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
