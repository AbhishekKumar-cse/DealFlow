// src/lib/schemas/health.ts — Zod schemas for the Deal Health API endpoints
// (Phase 12). Kept in `src/lib/schemas/` (the only place under `src/lib/` we
// are permitted to add new files for Phase 12).

import { z } from 'zod';

/** Body for POST /api/health/run — run the health check on one quote or all. */
export const RunHealthCheckSchema = z.object({
  /** Quote id. If omitted, the service runs the check on every open quote. */
  quoteId: z.string().min(1).optional(),
});
export type RunHealthCheckInput = z.infer<typeof RunHealthCheckSchema>;

/**
 * Body for PUT /api/health/config — update the active DealHealthConfig row.
 * Every field is optional (partial update); the service merges with the
 * existing row. All thresholds are integers (days, hours, percent, pp).
 */
export const UpdateHealthConfigSchema = z.object({
  stalledDaysThreshold: z.number().int().min(1).max(365).optional(),
  approvalSlaHours: z.number().int().min(1).max(720).optional(),
  deliverySlippageDays: z.number().int().min(0).max(365).optional(),
  discountAnomalyPpThreshold: z.number().int().min(0).max(100).optional(),
  marginDeteriorationThreshold: z.number().int().min(0).max(100).optional(),
  negotiationEscalationCount: z.number().int().min(1).max(50).optional(),
  active: z.boolean().optional(),
});
export type UpdateHealthConfigInput = z.infer<typeof UpdateHealthConfigSchema>;

/** Filters accepted by GET /api/health (paginated list of events). */
export const HealthListFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['OPEN', 'ACK', 'RESOLVED'])
    .optional(),
  severity: z
    .enum(['INFO', 'WARN', 'CRITICAL'])
    .optional(),
  type: z
    .enum([
      'STALLED',
      'APPROVAL_SLA_BREACH',
      'DELIVERY_SLIPPAGE',
      'DISCOUNT_ANOMALY',
      'MARGIN_DETERIORATION',
      'NEGOTIATION_ESCALATION',
      'BACKORDER',
    ])
    .optional(),
  quoteId: z.string().min(1).optional(),
});
export type HealthListFilters = z.infer<typeof HealthListFiltersSchema>;
