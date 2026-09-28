// src/application/recommendation/recommendation-service.ts — Orchestrates
// the deterministic recommendation engine. Loads the quote + catalog +
// product associations, calls the pure scorer, persists snapshots,
// and (optionally) adds a recommended product as a new quote line by
// reusing `addLine` from quotation-service.
//
// Layered design:
//   domain/recommendation/scorer  → pure math (this file calls it)
//   application/.../this file     → DB + audit
//   api/quotes/[id]/recommendations/* → HTTP + RBAC

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import type { Role } from '@/lib/enums';
import { NotFoundError } from '@/lib/api-error';
import {
  scoreCandidates,
  type ScoreOptions,
} from '@/domain/recommendation/scorer';
import {
  DEFAULT_SCORING_WEIGHTS,
  MIN_MARGIN_PERCENT,
  type RecommendationCandidate,
  type RecommendationResult,
  type ScoringWeights,
} from '@/domain/recommendation/types';
import { addLine } from '@/application/quotation/quotation-service';

export interface SessionActor {
  id: string;
  name: string;
  role: Role;
}

export interface GenerateOptions extends ScoreOptions {
  weights?: ScoringWeights;
  limit?: number;
}

/**
 * Generate fresh recommendations for a quote.
 *
 * Pipeline:
 *   1. Load quote (with lines + customer + product.category).
 *   2. Compute on-quote product ids and on-quote category names.
 *   3. Load all active products NOT already on the quote (with category).
 *   4. Filter: skip margin < MIN_MARGIN_PERCENT when cost is known.
 *   5. Load ProductAssociation rows where primaryId ∈ on-quote product ids.
 *   6. For each candidate, compute the strongest association + anchor name.
 *   7. Run the pure scorer → top N RecommendationResult.
 *   8. Delete the previous batch of snapshots for this quote, then persist
 *      the new batch (append-only is preserved via AuditEvent).
 *   9. Emit an audit event.
 *  10. Return the top-N results.
 */
export async function generateRecommendationsForQuote(
  quoteId: string,
  actor: SessionActor,
  options: GenerateOptions = {},
): Promise<RecommendationResult[]> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      lines: { include: { product: { include: { category: true } } } },
    },
  });
  if (!quote) throw new NotFoundError('Quote not found');

  const onQuoteProductIds = quote.lines.map((l) => l.productId);
  const onQuoteCategoryNames = Array.from(
    new Set(
      quote.lines
        .map((l) => l.product?.category?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  );

  // No lines yet → no co-purchase, no category signal — return empty
  // (the UI will show a helpful empty state).
  if (onQuoteProductIds.length === 0) {
    await replaceSnapshots(quoteId, quote.customerId, []);
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      entityType: 'recommendation',
      entityId: quoteId,
      quoteId,
      action: 'recommendation.generate',
      newValue: { count: 0, reason: 'quote has no lines' },
    });
    return [];
  }

  // Load all active products with category, EXCLUDING those on the quote.
  const candidateProducts = await db.product.findMany({
    where: {
      active: true,
      id: { notIn: onQuoteProductIds },
    },
    include: { category: true },
  });

  // Filter out thin-margin products when cost is known.
  const filtered = candidateProducts.filter((p) => {
    if (p.costCents == null) return true; // margin unknown → keep
    if (p.listPriceCents <= 0) return false;
    const marginPct = ((p.listPriceCents - p.costCents) / p.listPriceCents) * 100;
    return marginPct >= MIN_MARGIN_PERCENT;
  });

  // Load associations where primary ∈ on-quote products.
  const associations = await db.productAssociation.findMany({
    where: { primaryId: { in: onQuoteProductIds } },
    include: { primary: { select: { name: true } } },
  });

  // Group by relatedId → max strength + anchor product name.
  const bestAssociation = new Map<
    string,
    { strength: number; anchorName: string }
  >();
  for (const a of associations) {
    const prev = bestAssociation.get(a.relatedId);
    if (!prev || a.strength > prev.strength) {
      bestAssociation.set(a.relatedId, {
        strength: a.strength,
        anchorName: a.primary.name,
      });
    }
  }

  // Build candidate inputs for the pure scorer.
  const candidates: RecommendationCandidate[] = filtered.map((p) => {
    const assoc = bestAssociation.get(p.id);
    const marginRatio =
      p.costCents == null || p.listPriceCents <= 0
        ? null
        : Math.round(((p.listPriceCents - p.costCents) / p.listPriceCents) * 100);
    return {
      product: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        listPriceCents: p.listPriceCents,
        billingType: p.billingType as RecommendationCandidate['product']['billingType'],
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? '',
      },
      coPurchaseStrength: assoc?.strength ?? 0,
      coPurchaseAnchorName: assoc?.anchorName,
      marginRatio,
      listPriceCents: p.listPriceCents,
      costCents: p.costCents,
      onQuoteCategoryNames,
    };
  });

  const results = scoreCandidates(candidates, {
    weights: options.weights ?? DEFAULT_SCORING_WEIGHTS,
    limit: options.limit ?? 5,
  });

  await replaceSnapshots(quoteId, quote.customerId, results);

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'recommendation',
    entityId: quoteId,
    quoteId,
    action: 'recommendation.generate',
    newValue: {
      count: results.length,
      top: results[0]
        ? { productId: results[0].product.id, score: results[0].score }
        : null,
    },
  });

  return results;
}

/**
 * Return the latest batch of persisted snapshots for a quote.
 *
 * Snapshots are versioned per quote: each `generate` deletes the
 * previous batch for this quote before inserting the new one, so the
 * table only ever contains the most recent result set per quote.
 */
export async function listRecommendationsForQuote(
  quoteId: string,
): Promise<RecommendationResult[]> {
  const rows = await db.recommendationSnapshot.findMany({
    where: { quoteId },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    include: { product: { include: { category: true } } },
  });
  return rows.map(snapshotToResult);
}

/**
 * Add a recommended product as a new quote line at qty and discount=0.
 *
 * Reuses `addLine` from quotation-service so all of the existing
 * quote-state guards, ownership checks, and total recalculation still
 * apply. An additional audit event records that this line came from
 * the recommendation engine (so Phase 14 can measure upsell adoption).
 */
export async function addRecommendationToQuote(
  quoteId: string,
  productId: string,
  actor: SessionActor,
  qty = 1,
): Promise<RecommendationResult> {
  // Verify the product is in the latest snapshot for this quote — the
  // UI only calls this with snapshot ids, so this is a defensive check
  // to keep "ghost" adds (e.g. after the catalog changed) from going
  // through silently.
  const snapshot = await db.recommendationSnapshot.findFirst({
    where: { quoteId, productId },
    orderBy: { createdAt: 'desc' },
  });
  if (!snapshot) {
    throw new NotFoundError(
      'This product is not in the current recommendation set for this quote. Generate recommendations first.',
    );
  }

  // addLine enforces quote state (editable) + ownership + active product.
  const line = await addLine(actor, quoteId, {
    productId,
    qty,
    discountPercent: 0,
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'recommendation',
    entityId: snapshot.id,
    quoteId,
    action: 'recommendation.add',
    newValue: {
      productId,
      quoteLineId: line.id,
      qty,
      score: snapshot.score,
    },
  });

  const refreshed = await db.recommendationSnapshot.findUnique({
    where: { id: snapshot.id },
    include: { product: { include: { category: true } } },
  });
  return snapshotToResult(refreshed ?? snapshot);
}

// ─── helpers ────────────────────────────────────────────────────────────

async function replaceSnapshots(
  quoteId: string,
  customerId: string,
  results: RecommendationResult[],
): Promise<void> {
  // Delete previous batch for this quote (snapshots are versioned per
  // quote; historical traceability lives in AuditEvent).
  await db.recommendationSnapshot.deleteMany({ where: { quoteId } });

  if (results.length === 0) return;

  await db.recommendationSnapshot.createMany({
    data: results.map((r) => ({
      quoteId,
      customerId,
      productId: r.product.id,
      score: r.score,
      coPurchaseScore: r.coPurchaseScore,
      promotionScore: r.promotionScore,
      marginScore: r.marginScore,
      categoryScore: r.categoryScore,
      reasons: JSON.stringify(r.reasons),
      expectedMarginImpactCents: r.expectedMarginImpactCents,
    })),
  });
}

function snapshotToResult(row: any): RecommendationResult {
  const reasons = parseReasons(row.reasons);
  return {
    product: {
      id: row.product?.id ?? row.productId,
      name: row.product?.name ?? '',
      sku: row.product?.sku ?? '',
      listPriceCents: row.product?.listPriceCents ?? 0,
      billingType: (row.product?.billingType ?? 'ONE_TIME') as RecommendationResult['product']['billingType'],
      category: {
        id: row.product?.category?.id ?? row.product?.categoryId ?? '',
        name: row.product?.category?.name ?? '',
      },
    },
    score: row.score,
    coPurchaseScore: row.coPurchaseScore,
    promotionScore: row.promotionScore,
    marginScore: row.marginScore,
    categoryScore: row.categoryScore,
    reasons,
    expectedMarginImpactCents: row.expectedMarginImpactCents ?? 0,
  };
}

function parseReasons(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    // Legacy rows might be plain strings — surface them as a single bullet.
    return [raw];
  }
}

// Re-export the default weights for callers that want to override.
export { DEFAULT_SCORING_WEIGHTS };
