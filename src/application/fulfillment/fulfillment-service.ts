// src/application/fulfillment/fulfillment-service.ts — Orchestrates the
// deterministic multi-warehouse fulfillment optimizer. Loads the quote +
// warehouses + stock, calls the pure optimizer, persists the
// FulfillmentOrder + allocations + backorders, decrements warehouse
// stock (guarded against negative), and emits audit events.
//
// Layered design:
//   domain/fulfillment/optimizer  → pure math (this file calls it)
//   application/.../this file    → DB + audit
//   api/quotes/[id]/fulfillment  → HTTP + RBAC (run + get)
//   api/fulfillment              → HTTP + RBAC (list + override)

import { db } from '@/lib/db';
import { audit } from '@/services/audit/audit';
import type { Role } from '@/lib/enums';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api-error';
import { optimizeAllocation } from '@/domain/fulfillment/optimizer';
import type {
  AllocationLine,
  AllocationResult,
  LineRequirement,
  WarehouseStockRow,
} from '@/domain/fulfillment/types';
import { NoActiveWarehousesError } from '@/domain/fulfillment/errors';

export interface SessionActor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Run the deterministic optimizer for a confirmed quote and persist the
 * result. Throws `ConflictError` if the quote is not CONFIRMED.
 *
 * Pipeline:
 *   1. Load the quote with its lines (must be CONFIRMED).
 *   2. Load all active warehouses with their stock.
 *   3. Group quote lines by product, sum quantities → LineRequirement[].
 *   4. Call the pure optimizer.
 *   5. In a single transaction:
 *        - Create a FulfillmentOrder (FULFILLING or FULFILLED).
 *        - Create FulfillmentAllocation rows for each (warehouse, product, qty).
 *        - Decrement WarehouseStock.quantity for each allocated unit
 *          (re-read inside the transaction; throw ConflictError on
 *          negative balance — race-condition guard).
 *        - Create Backorder rows for each product shortfall.
 *        - Update the quote status (FULFILLING or FULFILLED).
 *   6. Emit the `fulfillment.run` audit event.
 *   7. Return the FulfillmentOrder with allocations + backorders.
 */
export async function runFulfillment(quoteId: string, actor: SessionActor) {
  // 1. Load the quote with its lines.
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true, customer: { select: { name: true } } },
  });
  if (!quote) throw new NotFoundError('Quote not found');
  if (quote.status !== 'CONFIRMED') {
    throw new ConflictError(
      `Fulfillment can only be run on a CONFIRMED quote. This quote is ${quote.status}.`,
    );
  }
  if (quote.lines.length === 0) {
    throw new ConflictError('Cannot fulfill a quote with no lines.');
  }

  // 2. Load all active warehouses with their stock.
  const warehouses = await db.warehouse.findMany({
    where: { active: true },
    include: { stock: true },
  });
  if (warehouses.length === 0) {
    throw new NoActiveWarehousesError();
  }

  // 3. Group quote lines by product, sum quantities.
  const grouped = new Map<string, LineRequirement>();
  for (const line of quote.lines) {
    const existing = grouped.get(line.productId);
    if (existing) {
      existing.qty += line.qty;
    } else {
      grouped.set(line.productId, {
        productId: line.productId,
        productName: line.productName,
        qty: line.qty,
      });
    }
  }
  const lineRequirements = Array.from(grouped.values());

  // Build WarehouseStockRow[] for the pure optimizer.
  const warehouseRows: WarehouseStockRow[] = warehouses.map((w) => ({
    warehouseId: w.id,
    name: w.name,
    code: w.code,
    shippingCostCents: w.shippingCostCents,
    stocks: Object.fromEntries(
      w.stock.map((s) => [s.productId, s.quantity]),
    ),
  }));

  // 4. Call the pure optimizer.
  const result = optimizeAllocation(lineRequirements, warehouseRows);

  // 5. Persist inside a single transaction.
  const persisted = await db.$transaction(async (tx) => {
    // 5a. Create the FulfillmentOrder header.
    const hasBackorders = result.backorders.length > 0;
    const orderStatus = hasBackorders ? 'FULFILLING' : 'FULFILLED';
    const primaryWarehouseId =
      result.warehousesUsed === 1 && result.allocations.length > 0
        ? result.allocations[0].warehouseId
        : null;

    const order = await tx.fulfillmentOrder.create({
      data: {
        quoteId,
        status: orderStatus,
        totalQty: result.totalQty,
        fulfilledQty: result.fulfilledQty,
        shippingCostCents: result.shippingCostCents,
        warehousesUsed: result.warehousesUsed,
        explanation: result.explanation,
        confirmedAt: new Date(),
        primaryWarehouseId,
      },
    });

    // 5b. Create allocations + decrement stock (guarded against negative).
    for (const alloc of result.allocations) {
      await tx.fulfillmentAllocation.create({
        data: {
          orderId: order.id,
          warehouseId: alloc.warehouseId,
          productId: alloc.productId,
          qty: alloc.qty,
          manualOverride: false,
        },
      });

      // Re-read the stock inside the transaction; if the row doesn't
      // exist or the balance would go negative, abort with a clear error.
      const stock = await tx.warehouseStock.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: alloc.warehouseId,
            productId: alloc.productId,
          },
        },
      });
      const current = stock?.quantity ?? 0;
      if (current < alloc.qty) {
        throw new ConflictError(
          `Insufficient stock for product ${alloc.productId} in warehouse ${alloc.warehouseId} (have ${current}, need ${alloc.qty}).`,
        );
      }
      if (stock) {
        await tx.warehouseStock.update({
          where: { id: stock.id },
          data: { quantity: current - alloc.qty },
        });
      } else {
        // Defensive: optimizer only allocates from existing stock, so this
        // branch should be unreachable. We insert a zero-balance row so the
        // audit trail shows the attempt.
        await tx.warehouseStock.create({
          data: {
            warehouseId: alloc.warehouseId,
            productId: alloc.productId,
            quantity: 0,
          },
        });
      }
    }

    // 5c. Create backorder rows.
    for (const back of result.backorders) {
      await tx.backorder.create({
        data: {
          orderId: order.id,
          productId: back.productId,
          shortQty: back.qty,
        },
      });
    }

    // 5d. Update the quote status.
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: orderStatus },
    });

    return order;
  });

  // 6. Emit audit event.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'fulfillment',
    entityId: persisted.id,
    quoteId,
    action: 'fulfillment.run',
    newValue: {
      status: persisted.status,
      warehousesUsed: persisted.warehousesUsed,
      fulfilledQty: persisted.fulfilledQty,
      totalQty: persisted.totalQty,
      shippingCostCents: persisted.shippingCostCents,
      backorderCount: result.backorders.length,
      explanation: persisted.explanation,
    },
  });

  // 7. Return the order with allocations + backorders.
  return db.fulfillmentOrder.findUnique({
    where: { id: persisted.id },
    include: {
      allocations: { include: { warehouse: true } },
      backorders: true,
      quote: {
        select: {
          id: true,
          number: true,
          customer: { select: { id: true, name: true, tier: true } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * Get the latest FulfillmentOrder (with allocations + backorders) for a
 * quote, or null if no fulfillment has been run yet.
 */
export async function getFulfillmentForQuote(quoteId: string) {
  const order = await db.fulfillmentOrder.findFirst({
    where: { quoteId },
    orderBy: { createdAt: 'desc' },
    include: {
      allocations: {
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      backorders: true,
    },
  });
  return order;
}

/**
 * Paginated list of FulfillmentOrders across all quotes (for the
 * Fulfillment view). Sorted by createdAt desc.
 */
export async function listFulfillmentOrders(
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: {
    status?: string;
    quote?: { number?: { contains: string } };
  } = {};
  if (options.status) where.status = options.status;
  if (options.search) {
    where.quote = { number: { contains: options.search } };
  }

  const [total, data] = await Promise.all([
    db.fulfillmentOrder.count({ where }),
    db.fulfillmentOrder.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        quote: {
          select: {
            id: true,
            number: true,
            customer: { select: { id: true, name: true, tier: true } },
            owner: { select: { id: true, name: true } },
          },
        },
        _count: { select: { allocations: true, backorders: true } },
      },
    }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Manually reassign a single allocation line to a different warehouse.
 *
 * Pipeline:
 *   1. Load the order + allocation + new warehouse.
 *   2. Validate the new warehouse has enough stock for the allocation qty.
 *   3. In a single transaction:
 *        - Restore the qty to the OLD warehouse's stock.
 *        - Decrement the qty from the NEW warehouse's stock (guarded).
 *        - Update the allocation with manualOverride=true + reason.
 *   4. Recalculate the order's totals (shippingCostCents, warehousesUsed)
 *      from the resulting allocations.
 *   5. Emit the `fulfillment.override` audit event with the reason.
 */
export async function manualOverrideAllocation(
  orderId: string,
  allocationId: string,
  newWarehouseId: string,
  reason: string,
  actor: SessionActor,
) {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError([
      {
        code: 'too_small',
        path: ['reason'],
        message: 'A reason is required for manual overrides.',
      },
    ]);
  }

  // 1. Load the order + allocation + new warehouse.
  const order = await db.fulfillmentOrder.findUnique({
    where: { id: orderId },
    include: { allocations: true },
  });
  if (!order) throw new NotFoundError('Fulfillment order not found');
  if (order.status === 'FULFILLED' || order.status === 'CANCELLED') {
    throw new ConflictError(
      `Cannot override an allocation on a ${order.status} fulfillment order.`,
    );
  }

  const allocation = order.allocations.find((a) => a.id === allocationId);
  if (!allocation) throw new NotFoundError('Allocation not found on this order');

  const newWarehouse = await db.warehouse.findUnique({
    where: { id: newWarehouseId },
  });
  if (!newWarehouse || !newWarehouse.active) {
    throw new NotFoundError('New warehouse not found or inactive');
  }
  if (newWarehouseId === allocation.warehouseId) {
    throw new ConflictError(
      'The new warehouse is the same as the current warehouse.',
    );
  }

  const qty = allocation.qty;
  const productId = allocation.productId;

  // 2. Validate the new warehouse has enough stock (outside the tx is fine
  // for the optimistic check; we re-validate inside the tx).
  const newStockPre = await db.warehouseStock.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: newWarehouseId,
        productId,
      },
    },
  });
  if ((newStockPre?.quantity ?? 0) < qty) {
    throw new ConflictError(
      `Warehouse ${newWarehouse.code} has only ${newStockPre?.quantity ?? 0} units of this product; ${qty} required.`,
    );
  }

  // 3. Persist inside a single transaction.
  const updated = await db.$transaction(async (tx) => {
    // Restore qty to the OLD warehouse.
    const oldStock = await tx.warehouseStock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: allocation.warehouseId,
          productId,
        },
      },
    });
    if (oldStock) {
      await tx.warehouseStock.update({
        where: { id: oldStock.id },
        data: { quantity: oldStock.quantity + qty },
      });
    } else {
      await tx.warehouseStock.create({
        data: {
          warehouseId: allocation.warehouseId,
          productId,
          quantity: qty,
        },
      });
    }

    // Decrement qty from the NEW warehouse (guarded against negative).
    const newStock = await tx.warehouseStock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: newWarehouseId,
          productId,
        },
      },
    });
    const current = newStock?.quantity ?? 0;
    if (current < qty) {
      throw new ConflictError(
        `Insufficient stock in warehouse ${newWarehouse.code} (have ${current}, need ${qty}).`,
      );
    }
    if (newStock) {
      await tx.warehouseStock.update({
        where: { id: newStock.id },
        data: { quantity: current - qty },
      });
    } else {
      await tx.warehouseStock.create({
        data: {
          warehouseId: newWarehouseId,
          productId,
          quantity: 0,
        },
      });
    }

    // Update the allocation row.
    const updatedAllocation = await tx.fulfillmentAllocation.update({
      where: { id: allocationId },
      data: {
        warehouseId: newWarehouseId,
        manualOverride: true,
        reason,
      },
    });

    return updatedAllocation;
  });

  // 4. Recalculate the order's totals from the resulting allocations.
  await recalcOrderTotals(orderId);

  // 5. Emit audit event.
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    actorName: actor.name,
    entityType: 'fulfillment',
    entityId: orderId,
    quoteId: order.quoteId,
    action: 'fulfillment.override',
    reason,
    oldValue: {
      allocationId,
      fromWarehouseId: allocation.warehouseId,
      toWarehouseId: newWarehouseId,
      productId,
      qty,
    },
    newValue: {
      allocationId: updated.id,
      warehouseId: newWarehouseId,
      manualOverride: true,
    },
  });

  return db.fulfillmentOrder.findUnique({
    where: { id: orderId },
    include: {
      allocations: {
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      backorders: true,
    },
  });
}

/**
 * Recalculate a FulfillmentOrder's denormalized totals (shipping cost
 * and warehouses used) from its allocations. Called after a manual
 * override changes which warehouses an order is drawing from.
 *
 * Note: warehousesUsed counts distinct warehouse ids in the allocations.
 * shippingCostCents is the sum of shippingCostCents of those distinct
 * warehouses.
 */
async function recalcOrderTotals(orderId: string): Promise<void> {
  const allocations = await db.fulfillmentAllocation.findMany({
    where: { orderId },
    select: { warehouseId: true, qty: true },
  });
  const distinctWarehouseIds = Array.from(
    new Set(allocations.map((a) => a.warehouseId)),
  );
  const warehouses = await db.warehouse.findMany({
    where: { id: { in: distinctWarehouseIds } },
    select: { id: true, shippingCostCents: true },
  });
  const shippingCostCents = warehouses.reduce(
    (sum, w) => sum + w.shippingCostCents,
    0,
  );
  await db.fulfillmentOrder.update({
    where: { id: orderId },
    data: {
      warehousesUsed: distinctWarehouseIds.length,
      shippingCostCents,
    },
  });
}

// Re-export the pure result type for callers (the API layer).
export type { AllocationLine, AllocationResult } from '@/domain/fulfillment/types';
