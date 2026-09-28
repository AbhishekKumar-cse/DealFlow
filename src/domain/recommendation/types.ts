// src/domain/recommendation/types.ts — Pure-domain types for the
// deterministic upsell/cross-sell recommendation engine.
//
// The recommendation engine is INTENTIONALLY DETERMINISTIC:
//   - All weights live in `ScoringWeights` (no hardcoded constants in the
//     scorer or the explanation builder).
//   - All signals are 0..100. The final score is a weighted average
//     normalized to 0..100 so it is directly comparable to risk scores.
//   - The engine never invents data: every score is derived from
//     `ProductAssociation`, the product's `costCents/listPriceCents`, the
//     product's `category.name`, and the categories already on the quote.
//
// Phase 16 (optional AI) may layer suggestions on top of these signals
// but must NOT replace the deterministic score.

import type { BillingType } from '@/lib/enums';

/**
 * The four normalized (0..100) sub-scores that combine into the final
 * recommendation score. They are also surfaced directly to the UI as a
 * signal breakdown so the rep can see WHY a product was suggested.
 */
export interface RecommendationSignal {
  coPurchaseScore: number;
  promotionScore: number;
  marginScore: number;
  categoryScore: number;
}

/**
 * A candidate product that has been pre-filtered (active, not on the
 * quote, margin above threshold) and is ready to be scored. The scorer
 * is a pure function over these inputs — it touches no DB.
 *
 * `onQuoteCategoryNames` is the set of category names of the products
 * already on the quote (used by the categoryScore).
 */
export interface RecommendationCandidate {
  product: {
    id: string;
    name: string;
    sku: string;
    listPriceCents: number;
    billingType: BillingType;
    categoryId: string;
    categoryName: string;
  };
  /**
   * The strongest co-purchase association between this candidate and
   * any product already on the quote (0 if no association exists).
   * Range 0..100 — already the same scale as the score.
   */
  coPurchaseStrength: number;
  /** Optional: the product name on the quote that drove the co-purchase score. */
  coPurchaseAnchorName?: string;
  /** Estimated gross margin ratio 0..100 = (listPrice - cost) / listPrice * 100. Null when cost is unknown. */
  marginRatio: number | null;
  /** List price in cents (same as product.listPriceCents — duplicated for convenience). */
  listPriceCents: number;
  /** Cost in cents (null when unknown — drives marginScore = 0). */
  costCents: number | null;
  /** The set of category names that already exist on the quote. */
  onQuoteCategoryNames: string[];
}

/**
 * The final, scored recommendation. Persisted to RecommendationSnapshot.
 */
export interface RecommendationResult extends RecommendationSignal {
  product: {
    id: string;
    name: string;
    sku: string;
    listPriceCents: number;
    billingType: BillingType;
    category: { id: string; name: string };
  };
  /** Final score 0..100. */
  score: number;
  /** Human-readable bullets, e.g. "Strong co-purchase with Laptop". */
  reasons: string[];
  /**
   * Estimated incremental gross margin if the product is added to the
   * quote at qty=1, list price, no discount. In integer cents.
   */
  expectedMarginImpactCents: number;
}

/**
 * Weights for the four signals. They are PERCENTS — they should sum to
 * 100 so the weighted average is normalized to 0..100. The scorer
 * divides the weighted sum by the total so callers can pass any
 * positive weights and still get a 0..100 result.
 *
 * Default weights emphasize co-purchase history (the strongest
 * evidence), then margin, then category fit, then promotions.
 */
export interface ScoringWeights {
  wCo: number;
  wPromo: number;
  wMargin: number;
  wCat: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  wCo: 40,
  wPromo: 15,
  wMargin: 25,
  wCat: 20,
};

/**
 * Products with cost known and a margin below this threshold (in %) are
 * filtered out before scoring — they would dilute the quote's blended
 * margin if added.
 */
export const MIN_MARGIN_PERCENT = 10;

/**
 * Promotion placeholder. Phase 04 will introduce a real Promotion model;
 * until then we apply a deterministic rule based on the product category:
 *   - "Subscriptions" → promotionScore = 50 (recurring revenue is
 *     strategically prioritized).
 *   - everything else → promotionScore = 20 (small baseline lift so the
 *     signal is never exactly zero, which would make the bar look
 *     "broken" in the UI).
 *
 * Documented here so the engine has a single source of truth and Phase
 * 04 can swap in a real Promotion lookup without touching the scorer's
 * signature.
 */
export const PROMOTION_SCORE_SUBSCRIPTION = 50;
export const PROMOTION_SCORE_DEFAULT = 20;
export const PROMOTION_CATEGORY_NAME = 'Subscriptions';

/**
 * Category-affinity map. The KEYS and VALUES are category names (case
 * sensitive — match ProductCategory.name exactly).
 *
 * Semantics:
 *   - If the candidate's category equals any on-quote category → 100
 *     (cross-sell deeper into a category the customer already buys).
 *   - Otherwise, look up the candidate's category against each on-quote
 *     category in this map (and vice-versa — the map is symmetric at
 *     read time via `categoryAffinity(a, b)`).
 *   - If no entry exists → 20 (small baseline so the bar is not zero).
 *
 * The values below are derived from the DealFlow360 product taxonomy
 * (Hardware / Accessories / Services / Subscriptions / Software).
 */
export const COMPLEMENTARY_CATEGORY_SCORE: Record<string, Record<string, number>> = {
  Hardware: { Accessories: 80, Services: 60, Subscriptions: 40, Software: 50 },
  Accessories: { Hardware: 80, Services: 40, Subscriptions: 30, Software: 50 },
  Services: { Hardware: 60, Accessories: 40, Subscriptions: 50, Software: 40 },
  Subscriptions: { Hardware: 40, Accessories: 30, Services: 50, Software: 50 },
  Software: { Hardware: 50, Accessories: 50, Services: 40, Subscriptions: 50 },
};

/** Same-category score (deep cross-sell). */
export const SAME_CATEGORY_SCORE = 100;
/** Default fallback when no affinity exists between the two categories. */
export const NO_CATEGORY_AFFINITY_SCORE = 20;

/**
 * Resolve the category affinity between two category names. Symmetric
 * and pure — used by the scorer.
 */
export function categoryAffinity(a: string, b: string): number {
  if (a === b) return SAME_CATEGORY_SCORE;
  return COMPLEMENTARY_CATEGORY_SCORE[a]?.[b] ?? NO_CATEGORY_AFFINITY_SCORE;
}
