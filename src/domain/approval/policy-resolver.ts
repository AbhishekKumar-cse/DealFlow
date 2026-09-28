// src/domain/approval/policy-resolver.ts — Resolve which approval chain to
// invoke for a given risk band.

import type { ApprovalChainRow } from './types';
import type { RiskBand } from '@/lib/enums';

/**
 * Pick the chain whose triggerBand is the strongest band ≤ the quote's band.
 * SAFE bands never need a chain.
 */
export function resolveApprovalChain(
  chains: ApprovalChainRow[],
  band: RiskBand,
): ApprovalChainRow | null {
  if (band === 'SAFE') return null;
  // Order bands by severity for matching.
  const bandOrder: RiskBand[] = ['SAFE', 'REVIEW', 'MANAGER', 'FINANCE'];
  const quoteIdx = bandOrder.indexOf(band);

  // Candidates: any chain whose triggerBand index ≤ quoteIdx.
  const candidates = chains.filter((c) => {
    const triggerIdx = bandOrder.indexOf(c.triggerBand);
    return triggerIdx <= quoteIdx;
  });
  if (candidates.length === 0) return null;
  // Pick the chain with the HIGHEST triggerBand index (most specific match).
  candidates.sort(
    (a, b) => bandOrder.indexOf(b.triggerBand) - bandOrder.indexOf(a.triggerBand),
  );
  return candidates[0];
}
