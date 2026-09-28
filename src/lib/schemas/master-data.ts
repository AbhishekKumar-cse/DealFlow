// src/lib/schemas/master-data.ts — Zod schemas for master data CRUD.

import { z } from 'zod';

export const CustomerTierSchema = z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);

export const CreateCustomerSchema = z.object({
  name: z.string().min(1).max(120),
  tier: CustomerTierSchema.default('BRONZE'),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  billingAddress: z.string().max(400).optional(),
  shippingAddress: z.string().max(400).optional(),
  currency: z.string().length(3).default('INR'),
  assignedRepId: z.string().optional(),
});
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = CreateCustomerSchema.partial();
export type UpdateCustomer = z.infer<typeof UpdateCustomerSchema>;

export const CreateContactSchema = z.object({
  customerId: z.string(),
  name: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  role: z.string().max(80).optional(),
  primary: z.boolean().default(false),
});
export type CreateContact = z.infer<typeof CreateContactSchema>;

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
});

export const BillingTypeSchema = z.enum(['ONE_TIME', 'RECURRING']);
export const PlanIntervalSchema = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(40),
  description: z.string().max(800).optional(),
  categoryId: z.string(),
  costCents: z.number().int().min(0).optional(),
  listPriceCents: z.number().int().min(0),
  billingType: BillingTypeSchema.default('ONE_TIME'),
  defaultInterval: PlanIntervalSchema.optional(),
  defaultIntervalCount: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
});
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

export const CreatePriceListSchema = z.object({
  name: z.string().min(1).max(80),
  currency: z.string().length(3).default('INR'),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const CreatePriceListItemSchema = z.object({
  priceListId: z.string(),
  productId: z.string(),
  unitPriceCents: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const CreateDiscountRuleSchema = z.object({
  name: z.string().min(1).max(80),
  customerTier: CustomerTierSchema.optional(),
  categoryId: z.string().optional(),
  productId: z.string().optional(),
  maxPercent: z.number().int().min(0).max(100),
  warnPercent: z.number().int().min(0).max(100).optional(),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CreateDiscountRule = z.infer<typeof CreateDiscountRuleSchema>;

export const UpdateDiscountRuleSchema = CreateDiscountRuleSchema.partial();
export type UpdateDiscountRule = z.infer<typeof UpdateDiscountRuleSchema>;

export const UpdateRiskConfigSchema = z.object({
  safeMax: z.number().int().min(0).max(100).optional(),
  reviewMax: z.number().int().min(0).max(100).optional(),
  managerMax: z.number().int().min(0).max(100).optional(),
  marginFactorLow: z.number().int().optional(),
  marginFactorHigh: z.number().int().optional(),
  marginLowThreshold: z.number().int().optional(),
  revenueConcentrationThreshold: z.number().int().optional(),
  multiViolationPenalty: z.number().int().optional(),
  highRevenuePenalty: z.number().int().optional(),
  lowMarginPenalty: z.number().int().optional(),
  negotiationEscalationPenalty: z.number().int().optional(),
  totalDiscountPenalty: z.number().int().optional(),
  totalDiscountThreshold: z.number().int().optional(),
  minDenominator: z.number().int().optional(),
});

export const CreateApprovalChainSchema = z.object({
  name: z.string().min(1).max(80),
  triggerBand: z.enum(['SAFE', 'REVIEW', 'MANAGER', 'FINANCE']).default('REVIEW'),
  active: z.boolean().default(true),
  steps: z
    .array(
      z.object({
        order: z.number().int().min(1),
        requiredRole: z.enum([
          'SALES_REP',
          'SALES_MANAGER',
          'FINANCE_OPERATIONS',
          'CUSTOMER',
          'ADMIN',
        ]),
        approverId: z.string().optional(),
      }),
    )
    .default([]),
});

export const CreateWarehouseSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  region: z.string().max(60).optional(),
  shippingCostCents: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const UpdateStockSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(0),
});

export const CreateSubscriptionPlanSchema = z.object({
  name: z.string().min(1).max(80),
  interval: PlanIntervalSchema,
  intervalCount: z.number().int().min(1).default(1),
  priceCents: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;
