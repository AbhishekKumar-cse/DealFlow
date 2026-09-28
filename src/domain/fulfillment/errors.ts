// src/domain/fulfillment/errors.ts — Domain-level errors for the
// fulfillment optimizer. The application service translates these into
// the HTTP-level errors defined in `src/lib/api-error.ts` where needed,
// but the domain layer stays free of HTTP concerns.

/**
 * Base class for all fulfillment-domain errors. Carries a stable
 * `code` string so the UI can switch on it without parsing messages.
 */
export class FulfillmentError extends Error {
  code: string;
  constructor(message: string, code = 'FULFILLMENT_ERROR') {
    super(message);
    this.name = 'FulfillmentError';
    this.code = code;
  }
}

/**
 * Thrown when no combination of warehouses (within the subset-size cap)
 * can satisfy the requested quantities AND a partial fulfillment was
 * explicitly disallowed by the caller. The default optimizer returns a
 * partial result instead of throwing; this error is reserved for callers
 * that demand complete fulfillment.
 */
export class InsufficientStockError extends FulfillmentError {
  constructor(message = 'Insufficient stock across all warehouses for complete fulfillment.') {
    super(message, 'INSUFFICIENT_STOCK');
    this.name = 'InsufficientStockError';
  }
}

/**
 * Thrown when the optimizer is asked to allocate but there are no active
 * warehouses with any stock at all.
 */
export class NoActiveWarehousesError extends FulfillmentError {
  constructor(message = 'No active warehouses available to allocate from.') {
    super(message, 'NO_ACTIVE_WAREHOUSES');
    this.name = 'NoActiveWarehousesError';
  }
}
