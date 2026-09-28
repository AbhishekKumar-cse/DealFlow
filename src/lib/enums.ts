// src/lib/enums.ts — Single source of truth for all discriminating string
// values. SQLite does not support Prisma enums, so we use string columns
// validated against these Zod schemas.

import { z } from 'zod';

export const RoleEnum = z.enum([
  'SALES_REP',
  'SALES_MANAGER',
  'FINANCE_OPERATIONS',
  'CUSTOMER',
  'ADMIN',
]);
export type Role = z.infer<typeof RoleEnum>;

export const CustomerTierEnum = z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
export type CustomerTier = z.infer<typeof CustomerTierEnum>;

export const BillingTypeEnum = z.enum(['ONE_TIME', 'RECURRING']);
export type BillingType = z.infer<typeof BillingTypeEnum>;

export const PlanIntervalEnum = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);
export type PlanInterval = z.infer<typeof PlanIntervalEnum>;

export const RiskBandEnum = z.enum(['SAFE', 'REVIEW', 'MANAGER', 'FINANCE']);
export type RiskBand = z.infer<typeof RiskBandEnum>;

export const QuoteStatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CONFIRMED',
  'FULFILLING',
  'FULFILLED',
  'CANCELLED',
]);
export type QuoteStatus = z.infer<typeof QuoteStatusEnum>;

export const ApprovalStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'SUPERSEDED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

export const FulfillmentStatusEnum = z.enum([
  'FULFILLING',
  'FULFILLED',
  'PARTIAL',
  'BACKORDERED',
  'CANCELLED',
]);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusEnum>;

export const SubscriptionStatusEnum = z.enum([
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

export const InvoiceTypeEnum = z.enum(['ONE_TIME', 'RECURRING', 'PRORATED', 'CREDIT']);
export type InvoiceType = z.infer<typeof InvoiceTypeEnum>;

export const InvoiceStatusEnum = z.enum([
  'DRAFT',
  'ISSUED',
  'PAID',
  'PARTIAL',
  'OVERDUE',
  'VOID',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const PaymentMethodEnum = z.enum(['SIMULATED', 'BANK_TRANSFER', 'CARD', 'WIRE']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentStatusEnum = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const NegotiationStatusEnum = z.enum(['OPEN', 'ACCEPTED', 'REJECTED', 'SUPERSEDED']);
export type NegotiationStatus = z.infer<typeof NegotiationStatusEnum>;

export const HealthEventTypeEnum = z.enum([
  'STALLED',
  'APPROVAL_SLA_BREACH',
  'DELIVERY_SLIPPAGE',
  'DISCOUNT_ANOMALY',
  'MARGIN_DETERIORATION',
  'NEGOTIATION_ESCALATION',
  'BACKORDER',
]);
export type HealthEventType = z.infer<typeof HealthEventTypeEnum>;

export const HealthSeverityEnum = z.enum(['INFO', 'WARN', 'CRITICAL']);
export type HealthSeverity = z.infer<typeof HealthSeverityEnum>;

export const HealthEventStatusEnum = z.enum(['OPEN', 'ACK', 'RESOLVED']);
export type HealthEventStatus = z.infer<typeof HealthEventStatusEnum>;

// Helper to coerce a string->enum value with a safe fallback.
export function asEnum<T extends z.ZodEnum<any>>(
  schema: T,
  raw: unknown,
  fallback: z.infer<T>,
): z.infer<T> {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

// Pretty-print a role for the UI.
export function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
