// src/domain/quotation/errors.ts — Quotation domain errors.

export class QuotationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'QuotationError';
  }
}

export class InvalidLineError extends QuotationError {
  constructor(message: string) {
    super(message, 'INVALID_LINE');
    this.name = 'InvalidLineError';
  }
}

export class InvalidStateTransitionError extends QuotationError {
  constructor(from: string, to: string) {
    super(`Cannot transition quote from ${from} to ${to}`, 'INVALID_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

export class EmptyQuoteError extends QuotationError {
  constructor() {
    super('Quote must have at least one line', 'EMPTY_QUOTE');
    this.name = 'EmptyQuoteError';
  }
}

export class QuoteLineNotFoundError extends QuotationError {
  constructor(lineId: string) {
    super(`Quote line not found: ${lineId}`, 'LINE_NOT_FOUND');
    this.name = 'QuoteLineNotFoundError';
  }
}
