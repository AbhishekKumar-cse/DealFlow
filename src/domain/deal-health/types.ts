// src/domain/deal-health/types.ts — Deal health detector types.

import type { HealthEventType, HealthSeverity } from '@/lib/enums';

export interface HealthConfigRow {
  stalledDaysThreshold: number;
  approvalSlaHours: number;
  deliverySlippageDays: number;
  discountAnomalyPpThreshold: number;
  marginDeteriorationThreshold: number;
  negotiationEscalationCount: number;
}

export interface QuoteContext {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  expectedDeliveryDate?: string | null;
  totalDiscountPct: number;
  marginPct: number;
  customer: { id: string; name: string; tier: string };
  approvalRequests: {
    id: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  fulfillmentOrders: {
    id: string;
    status: string;
    backorders: { id: string; resolvedAt: string | null; shortQty: number }[];
  }[];
  negotiations: { id: string; status: string; createdAt: string }[];
  historicalAvgDiscountPct: number | null;
}

export interface DetectorResult {
  type: HealthEventType;
  severity: HealthSeverity;
  evidence: string;
  recommendedAction: string;
}
