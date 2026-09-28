// src/domain/recommendation/scorer.ts — Pure deterministic scoring.
//
// Pipeline:
//   STEP 1 — compute four sub-scores per candidate (0..100):
//              coPurchaseScore, promotionScore, marginScore, categoryScore
//   STEP 2 — weighted average normalized to 0..100:
//              finalScore = (Σ wᵢ · sᵢ) / (Σ wᵢ)
//   STEP 3 — sort by finalScore desc, return as RecommendationResult[]
//
// All weights and baselines come from `ScoringWeights` and the constants
// in `types.ts` — there are NO magic numbers in this file.

import type {
  RecommendationCandidate,
  RecommendationResult,
  RecommendationSignal,
  ScoringWeights,
} from './types';
import {
  DEFAULT_SCORING_WEIGHTS,
  PROMOTION_CATEGORY_NAME,
  PROMOTION_SCORE_DEFAULT,
  PROMOTION_SCORE_SUBSCRIPTION,
  categoryAffinity,
} from './types';
import { buildExplanation } from './explanation-builder';

export interface ScoreOptions {
  weights?: ScoringWeights;
  /** Maximum number of recommendations to return (default 5). */
  limit?: number;
}

/**
 * Score a list of pre-filtered candidates and return the top-N
 * recommendations sorted by final score descending.
 *
 * This function is PURE — it has no side effects and does not touch
 * the database. The application service is responsible for loading
 * candidates, persisting snapshots, and emitting audit events.
 */
export function scoreCandidates(
  candidates: RecommendationCandidate[],
  options: ScoreOptions = {},
): RecommendationResult[] {
  const weights = options.weights ?? DEFAULT_SCORING_WEIGHTS;
  const limit = options.limit ?? 5;

  const results = candidates.map((c) => scoreOne(c, weights));
  // Deterministic tie-break: score desc, then name asc (stable ordering
  // across runs so the UI doesn't flicker between renders).
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.product.name.localeCompare(b.product.name);
  });
  return results.slice(0, limit);
}

function scoreOne(
  candidate: RecommendationCandidate,
  weights: ScoringWeights,
): RecommendationResult {
  const signals: RecommendationSignal = {
    coPurchaseScore: clamp(Math.round(candidate.coPurchaseStrength)),
    promotionScore: clamp(promotionScoreFor(candidate)),
    marginScore: clamp(marginScoreFor(candidate)),
    categoryScore: clamp(categoryScoreFor(candidate)),
  };

  const totalWeight = Math.max(
    1,
    weights.wCo + weights.wPromo + weights.wMargin + weights.wCat,
  );
  const raw =
    weights.wCo * signals.coPurchaseScore +
    weights.wPromo * signals.promotionScore +
    weights.wMargin * signals.marginScore +
    weights.wCat * signals.categoryScore;
  const score = clamp(Math.round(raw / totalWeight));

  const expectedMarginImpactCents = computeMarginImpactCents(candidate);

  return {
    ...signals,
    product: {
      id: candidate.product.id,
      name: candidate.product.name,
      sku: candidate.product.sku,
      listPriceCents: candidate.product.listPriceCents,
      billingType: candidate.product.billingType,
      category: {
        id: candidate.product.categoryId,
        name: candidate.product.categoryName,
      },
    },
    score,
    reasons: buildExplanation({
      ...signals,
      product: candidate.product,
      coPurchaseAnchorName: candidate.coPurchaseAnchorName,
      marginRatio: candidate.marginRatio,
      onQuoteCategoryNames: candidate.onQuoteCategoryNames,
    }),
    expectedMarginImpactCents,
  };
}

function promotionScoreFor(candidate: RecommendationCandidate): number {
  // Phase 04 placeholder — see PROMOTION_SCORE_* docs in types.ts.
  return candidate.product.categoryName === PROMOTION_CATEGORY_NAME
    ? PROMOTION_SCORE_SUBSCRIPTION
    : PROMOTION_SCORE_DEFAULT;
}

function marginScoreFor(candidate: RecommendationCandidate): number {
  // If cost is unknown we cannot compute a margin — return 0 (no signal).
  if (candidate.marginRatio == null) return 0;
  // marginRatio is already 0..100 — it maps directly to the 0..100 score.
  return Math.round(candidate.marginRatio);
}

function categoryScoreFor(candidate: RecommendationCandidate): number {
  const onQuote = candidate.onQuoteCategoryNames;
  if (onQuote.length === 0) return 0;

  // If the candidate's category is already on the quote → deep cross-sell.
  if (onQuote.includes(candidate.product.categoryName)) {
    return 100;
  }

  // Otherwise take the MAX affinity against every on-quote category.
  let best = 0;
  for (const name of onQuote) {
    const affinity = categoryAffinity(candidate.product.categoryName, name);
    if (affinity > best) best = affinity;
  }
  return best;
}

/**
 * Estimated incremental gross margin if the product is added at qty=1,
 * list price, no discount. Used to communicate $-impact in the UI.
 *
 * Margin impact = listPrice - cost (only when cost is known).
 */
function computeMarginImpactCents(candidate: RecommendationCandidate): number {
  if (candidate.costCents == null) return 0;
  return Math.max(0, candidate.listPriceCents - candidate.costCents);
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}
