// src/domain/fulfillment/types.ts — Pure-domain types for the
// deterministic multi-warehouse fulfillment optimizer.
//
// The optimizer is INTENTIONALLY DETERMINISTIC:
//   - It uses candidate-subset evaluation: for each subset size (1, 2, 3)
//     ascending, it enumerates all combinations of warehouses, evaluates
//     feasibility, and picks the first feasible subset — guaranteeing the
//     minimum number of warehouses is used before any cost comparison.
//   - Tie-breaks are alphabetical by warehouse code so two runs of the
//     same inputs always produce the same allocations.
//   - The engine never invents stock: every allocation is derived from
//     `WarehouseStockRow.stocks` provided by the caller.
//
// Priority order:
//   1. PRIMARY   — minimize number of warehouses used (1 > 2 > 3).
//   2. SECONDARY — minimize total shipping cost (sum of shippingCostCents
//     of the warehouses used).
//   3. TERTIARY  — maximize fulfilled quantity when complete fulfillment
//     is impossible (partial mode).

/**
 * A single line requirement derived from a confirmed quote's lines.
 * Multiple quote lines for the same product are summed into one
 * `LineRequirement` by the application service before the optimizer
 * is invoked, so the optimizer can assume `productId` is unique within
 * the input array.
 */
export interface LineRequirement {
  productId: string;
  productName: string;
  qty: number;
}

/**
 * One row per warehouse, with all of its on-hand stock flattened into a
 * `Record<productId, qty>`. The application service builds these from the
 * Prisma `Warehouse` + `WarehouseStock` rows so the optimizer stays pure
 * (no DB access).
 */
export interface WarehouseStockRow {
  warehouseId: string;
  name: string;
  code: string;
  shippingCostCents: number;
  stocks: Record<string, number>;
}

/**
 * A single allocation line: this warehouse ships this many units of this
 * product. `manualOverride` is set to `true` when an operator later
 * reassigns the line to a different warehouse via the override endpoint.
 */
export interface AllocationLine {
  warehouseId: string;
  productId: string;
  qty: number;
  manualOverride?: boolean;
  reason?: string;
}

/**
 * A backorder line — the optimizer could not fulfill this many units of
 * the product from any combination of warehouses (within the subset-size
 * cap of 3).
 */
export interface BackorderLine {
  productId: string;
  productName: string;
  qty: number;
}

/**
 * The full optimization result returned by the pure optimizer.
 *
 * `orderId` is filled in by the application service when the result is
 * persisted to a `FulfillmentOrder` row — the pure optimizer itself does
 * not know the order id and leaves it as an empty string.
 */
export interface AllocationResult {
  orderId: string;
  allocations: AllocationLine[];
  /** Count of distinct warehouse ids used in `allocations`. */
  warehousesUsed: number;
  /** Sum of `shippingCostCents` of the distinct warehouses used. */
  shippingCostCents: number;
  fulfilledQty: number;
  totalQty: number;
  backorders: BackorderLine[];
  /** Human-readable explanation, e.g. "Selected 1 warehouse — …". */
  explanation: string;
  /** True when every line was fully allocated. */
  complete: boolean;
}

/** Maximum number of warehouses the optimizer will consider combining. */
export const MAX_WAREHOUSE_SUBSET_SIZE = 3;
