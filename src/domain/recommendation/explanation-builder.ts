// src/domain/recommendation/explanation-builder.ts — Pure function that
// turns a scored recommendation into a small list of human-readable
// bullets surfaced in the UI ("Why this product?").
//
// Pure: no DB, no I/O. The bullets are derived solely from the signals
// and the candidate metadata. Thresholds for "Strong"/"High" labels
// are defined here so the rest of the engine stays numeric.

import type { RecommendationSignal } from './types';
import { PROMOTION_CATEGORY_NAME } from './types';

export interface ExplanationInput extends RecommendationSignal {
  product: {
    id: string;
    name: string;
    sku: string;
    listPriceCents: number;
    billingType: string;
    categoryName: string;
  };
  /** The product on the quote that drove the co-purchase score, if any. */
  coPurchaseAnchorName?: string;
  /** 0..100 gross margin ratio, or null when cost is unknown. */
  marginRatio: number | null;
  /** Category names that already exist on the quote. */
  onQuoteCategoryNames: string[];
}

/**
 * Build a 1..4 length list of human-readable reasons. Reasons are
 * ordered by signal strength (strongest first) so the top bullet is the
 * most important driver.
 */
export function buildExplanation(input: ExplanationInput): string[] {
  const reasons: { strength: number; text: string }[] = [];

  if (input.coPurchaseScore >= 50 && input.coPurchaseAnchorName) {
    reasons.push({
      strength: input.coPurchaseScore,
      text: `Strong co-purchase with ${input.coPurchaseAnchorName} (${input.coPurchaseScore}/100).`,
    });
  } else if (input.coPurchaseScore >= 25 && input.coPurchaseAnchorName) {
    reasons.push({
      strength: input.coPurchaseScore,
      text: `Frequently bought with ${input.coPurchaseAnchorName} (${input.coPurchaseScore}/100).`,
    });
  } else if (input.coPurchaseScore > 0 && input.coPurchaseAnchorName) {
    reasons.push({
      strength: input.coPurchaseScore,
      text: `Sometimes bought with ${input.coPurchaseAnchorName} (${input.coPurchaseScore}/100).`,
    });
  }

  if (input.marginRatio != null && input.marginScore >= 40) {
    reasons.push({
      strength: input.marginScore,
      text: `High margin (${input.marginRatio}%).`,
    });
  } else if (input.marginRatio != null && input.marginScore >= 20) {
    reasons.push({
      strength: input.marginScore,
      text: `Healthy margin (${input.marginRatio}%).`,
    });
  } else if (input.marginRatio == null) {
    reasons.push({
      strength: 0,
      text: 'Margin unknown — cost not on file.',
    });
  }

  if (
    input.promotionScore >= 50 &&
    input.product.categoryName === PROMOTION_CATEGORY_NAME
  ) {
    reasons.push({
      strength: input.promotionScore,
      text: 'Promotion active — subscription revenue is strategically prioritized.',
    });
  }

  if (input.onQuoteCategoryNames.includes(input.product.categoryName)) {
    reasons.push({
      strength: 100,
      text: `Same category as a product already on the quote (${input.product.categoryName}).`,
    });
  } else if (input.categoryScore >= 50) {
    reasons.push({
      strength: input.categoryScore,
      text: `Complementary category (${input.product.categoryName}).`,
    });
  }

  // Sort by strength descending, then take the top 3 bullets. The UI
  // lists them verbatim.
  reasons.sort((a, b) => b.strength - a.strength);
  return reasons.slice(0, 3).map((r) => r.text);
}
