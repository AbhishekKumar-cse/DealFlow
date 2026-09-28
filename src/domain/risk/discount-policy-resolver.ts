// src/domain/risk/discount-policy-resolver.ts — Resolve the applicable
// discount ceiling for a quote line. Most-specific rule wins.
//
// Precedence (highest first):
//   1. product-specific + customer-tier-specific
//   2. category-specific + customer-tier-specific
//   3. customer-tier-only
//   4. category-only
//   5. global default (no scope filters)
//
// Ties on scope specificity are broken by priority (higher wins); further
// ties broken by maxPercent (more permissive wins).

import type { DiscountRuleRow } from './types';
import type { CustomerTier } from '@/lib/enums';

export interface ResolveInput {
  productId: string;
  categoryId: string | null;
  customerTier: CustomerTier | null;
}

export interface ResolveResult {
  allowedPercent: number;
  warnPercent: number | null;
  rule: DiscountRuleRow | null;
  matchedScope: string;
}

/** Pure resolver — caller passes the active rule set. */
export function resolveDiscountRule(
  rules: DiscountRuleRow[],
  input: ResolveInput,
): ResolveResult {
  // Filter active rules.
  const active = rules.filter((r) => r.active);
  // Score each rule's specificity.
  const scored = active
    .map((r) => ({
      rule: r,
      scope: specificityScore(r, input),
      matches: scopeMatches(r, input),
    }))
    .filter((x) => x.matches)
    .sort((a, b) => b.scope - a.scope || b.rule.priority - a.rule.priority || b.rule.maxPercent - a.rule.maxPercent);

  if (scored.length === 0) {
    return {
      allowedPercent: 0,
      warnPercent: null,
      rule: null,
      matchedScope: 'DEFAULT',
    };
  }
  const winner = scored[0];
  return {
    allowedPercent: winner.rule.maxPercent,
    warnPercent: winner.rule.warnPercent,
    rule: winner.rule,
    matchedScope: scopeLabel(winner.rule),
  };
}

function specificityScore(r: DiscountRuleRow, input: ResolveInput): number {
  let score = 0;
  if (r.productId && r.productId === input.productId) score += 100;
  if (r.categoryId && input.categoryId && r.categoryId === input.categoryId) score += 50;
  if (r.customerTier && input.customerTier && r.customerTier === input.customerTier) score += 25;
  // Priority contributes a smaller bonus.
  score += Math.max(0, Math.min(10, r.priority));
  return score;
}

function scopeMatches(r: DiscountRuleRow, input: ResolveInput): boolean {
  if (r.productId && r.productId !== input.productId) return false;
  if (r.categoryId && (!input.categoryId || r.categoryId !== input.categoryId)) return false;
  if (r.customerTier && (!input.customerTier || r.customerTier !== input.customerTier)) return false;
  return true;
}

function scopeLabel(r: DiscountRuleRow): string {
  const parts: string[] = [];
  if (r.productId) parts.push('product');
  if (r.categoryId) parts.push('category');
  if (r.customerTier) parts.push(r.customerTier);
  if (parts.length === 0) return 'GLOBAL';
  return parts.join('+').toUpperCase();
}
