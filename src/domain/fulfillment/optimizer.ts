// src/domain/fulfillment/optimizer.ts — Pure deterministic multi-warehouse
// allocation optimizer.
//
// Business priority order:
//   1. PRIMARY  — minimize number of warehouses used (1 > 2 > 3).
//   2. SECONDARY — minimize total shipping cost (sum of shippingCostCents
//      of the distinct warehouses used).
//   3. TERTIARY — maximize fulfilled quantity when complete fulfillment
//      is impossible (partial mode + backorders).
//
// Algorithm (candidate-subset evaluation):
//   PHASE 1 — Full fulfillment
//     For each subset size S from 1 up to min(warehouses.length, 3):
//       Enumerate every S-sized combination of warehouses.
//       For each combination, attempt to fulfill ALL line requirements
//       using the combined stock — for each product, pull from the
//       subset's warehouses in alphabetical order by code (deterministic).
//       If a combination fully fulfills → record it as a candidate.
//       If any candidate exists for this S, pick the one with the lowest
//       total shipping cost; ties broken alphabetically by warehouse
//       codes. Return immediately (smaller S is always preferred over
//       any larger S).
//   PHASE 2 — Partial fulfillment (only if PHASE 1 found nothing)
//     For each subset size S from 1..3, enumerate combinations and
//     evaluate each one's fulfilledQty (using the same allocation
//     procedure). Pick the candidate maximizing fulfilledQty, then
//     minimizing warehousesUsed, then minimizing shippingCost, then
//     alphabetically by codes. Build BackorderLine entries for each
//     product's shortfall.
//
// The function is pure: it touches no DB and produces no side effects.
// All inputs are passed in by the application service.

import {
  MAX_WAREHOUSE_SUBSET_SIZE,
  type AllocationLine,
  type AllocationResult,
  type BackorderLine,
  type LineRequirement,
  type WarehouseStockRow,
} from './types';
import { NoActiveWarehousesError } from './errors';

/**
 * Run the deterministic optimizer over the given line requirements and
 * warehouse stock rows. Returns an `AllocationResult` (with `orderId` left
 * blank — the application service fills it in when persisting).
 */
export function optimizeAllocation(
  lines: LineRequirement[],
  warehouses: WarehouseStockRow[],
): AllocationResult {
  // Trivial case — no lines to fulfill. Return an empty (but valid) result.
  if (lines.length === 0) {
    return {
      orderId: '',
      allocations: [],
      warehousesUsed: 0,
      shippingCostCents: 0,
      fulfilledQty: 0,
      totalQty: 0,
      backorders: [],
      explanation: 'No lines to fulfill.',
      complete: true,
    };
  }

  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  // Sort warehouses alphabetically by code for deterministic combination
  // enumeration. The original caller order is irrelevant.
  const sorted = [...warehouses].sort((a, b) => a.code.localeCompare(b.code));
  if (sorted.length === 0) {
    throw new NoActiveWarehousesError();
  }

  const maxSubset = Math.min(sorted.length, MAX_WAREHOUSE_SUBSET_SIZE);

  // ── PHASE 1 — Full fulfillment ─────────────────────────────────────
  for (let s = 1; s <= maxSubset; s++) {
    const combos = combinations(sorted, s);
    interface FullCandidate {
      warehouses: WarehouseStockRow[];
      allocations: AllocationLine[];
      shippingCostCents: number;
      codesKey: string;
    }
    const fullCandidates: FullCandidate[] = [];
    for (const combo of combos) {
      const { allocations, remaining } = attemptAllocation(lines, combo);
      if (remaining.size === 0) {
        const shippingCostCents = combo.reduce(
          (sum, w) => sum + w.shippingCostCents,
          0,
        );
        fullCandidates.push({
          warehouses: combo,
          allocations,
          shippingCostCents,
          codesKey: combo.map((w) => w.code).join('|'),
        });
      }
    }
    if (fullCandidates.length > 0) {
      // Lowest shipping cost wins; ties broken alphabetically by codes.
      fullCandidates.sort((a, b) => {
        if (a.shippingCostCents !== b.shippingCostCents) {
          return a.shippingCostCents - b.shippingCostCents;
        }
        return a.codesKey.localeCompare(b.codesKey);
      });
      const chosen = fullCandidates[0];
      const explanation =
        chosen.warehouses.length === 1
          ? `Selected 1 warehouse — ${chosen.warehouses[0].name} has sufficient stock.`
          : `Selected ${chosen.warehouses.length} warehouses because no single warehouse can satisfy the requested quantity.`;
      return {
        orderId: '',
        allocations: chosen.allocations,
        warehousesUsed: chosen.warehouses.length,
        shippingCostCents: chosen.shippingCostCents,
        fulfilledQty: totalQty,
        totalQty,
        backorders: [],
        explanation,
        complete: true,
      };
    }
  }

  // ── PHASE 2 — Partial fulfillment ──────────────────────────────────
  interface PartialCandidate {
    warehouses: WarehouseStockRow[];
    allocations: AllocationLine[];
    fulfilledQty: number;
    remaining: Map<string, number>;
    shippingCostCents: number;
    codesKey: string;
    subsetSize: number;
  }
  let best: PartialCandidate | null = null;

  for (let s = 1; s <= maxSubset; s++) {
    const combos = combinations(sorted, s);
    for (const combo of combos) {
      const { allocations, fulfilledQty, remaining } = attemptAllocation(
        lines,
        combo,
      );
      const shippingCostCents = combo.reduce(
        (sum, w) => sum + w.shippingCostCents,
        0,
      );
      const candidate: PartialCandidate = {
        warehouses: combo,
        allocations,
        fulfilledQty,
        remaining,
        shippingCostCents,
        codesKey: combo.map((w) => w.code).join('|'),
        subsetSize: s,
      };
      if (!best) {
        best = candidate;
        continue;
      }
      const cmp = comparePartial(candidate, best);
      if (cmp < 0) best = candidate;
    }
  }

  if (!best) {
    // Defensive — `sorted` was non-empty so `best` must have been set.
    throw new NoActiveWarehousesError();
  }

  // Build backorder lines for each product's shortfall (in input order).
  const backorders: BackorderLine[] = [];
  for (const line of lines) {
    const short = best.remaining.get(line.productId) ?? 0;
    if (short > 0) {
      backorders.push({
        productId: line.productId,
        productName: line.productName,
        qty: short,
      });
    }
  }

  const shortQty = totalQty - best.fulfilledQty;
  const explanation = `Partial fulfillment — ${best.fulfilledQty}/${totalQty} units available. Backorder created for ${shortQty} units.`;

  // If nothing could be fulfilled at all, zero out warehouse usage so we
  // don't claim a warehouse "used" with zero units shipped.
  const warehousesUsed = best.fulfilledQty > 0 ? best.warehouses.length : 0;
  const shippingCostCents = best.fulfilledQty > 0 ? best.shippingCostCents : 0;
  const allocations = best.fulfilledQty > 0 ? best.allocations : [];

  return {
    orderId: '',
    allocations,
    warehousesUsed,
    shippingCostCents,
    fulfilledQty: best.fulfilledQty,
    totalQty,
    backorders,
    explanation,
    complete: false,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────

/**
 * Attempt to fulfill `lines` from the given subset of warehouses. For
 * each product (in input order), pull stock from the subset's warehouses
 * in alphabetical order until the line is satisfied or the subset is
 * exhausted. Returns the allocation lines, the total fulfilled qty, and
 * a map of `productId → shortfall` for any unmet demand.
 *
 * `warehouses` MUST be sorted alphabetically by code (the caller does
 * this once for the whole optimizer run).
 */
function attemptAllocation(
  lines: LineRequirement[],
  warehouses: WarehouseStockRow[],
): {
  allocations: AllocationLine[];
  fulfilledQty: number;
  remaining: Map<string, number>;
} {
  // Mutable copy of per-warehouse stock so different products don't see
  // each other's draws within the same attempt.
  const available: Record<string, Record<string, number>> = {};
  for (const w of warehouses) {
    available[w.warehouseId] = { ...w.stocks };
  }

  const allocations: AllocationLine[] = [];
  let fulfilledQty = 0;
  const remaining = new Map<string, number>();

  for (const line of lines) {
    let need = line.qty;
    for (const w of warehouses) {
      if (need <= 0) break;
      const stock = available[w.warehouseId][line.productId] ?? 0;
      if (stock <= 0) continue;
      const take = Math.min(need, stock);
      if (take > 0) {
        allocations.push({
          warehouseId: w.warehouseId,
          productId: line.productId,
          qty: take,
        });
        available[w.warehouseId][line.productId] = stock - take;
        need -= take;
        fulfilledQty += take;
      }
    }
    if (need > 0) remaining.set(line.productId, need);
  }

  return { allocations, fulfilledQty, remaining };
}

/**
 * Compare two partial candidates by the tertiary priority order:
 *   1. fulfilledQty desc (more is better)
 *   2. warehousesUsed asc (fewer is better)
 *   3. shippingCostCents asc (cheaper is better)
 *   4. codesKey asc (alphabetical tie-break for determinism)
 *
 * Returns <0 if `a` is better than `b`, >0 if `b` is better, 0 if equal.
 */
function comparePartial(a: {
  fulfilledQty: number;
  subsetSize: number;
  shippingCostCents: number;
  codesKey: string;
}, b: {
  fulfilledQty: number;
  subsetSize: number;
  shippingCostCents: number;
  codesKey: string;
}): number {
  if (a.fulfilledQty !== b.fulfilledQty) return b.fulfilledQty - a.fulfilledQty;
  if (a.subsetSize !== b.subsetSize) return a.subsetSize - b.subsetSize;
  if (a.shippingCostCents !== b.shippingCostCents) return a.shippingCostCents - b.shippingCostCents;
  return a.codesKey.localeCompare(b.codesKey);
}

/**
 * Generate all k-sized combinations of `arr` (preserving input order).
 * Returns an array of arrays. Pure and recursive.
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}
