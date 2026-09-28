// src/domain/approval/types.ts — Approval domain types.

import type { ApprovalStatus, RiskBand, Role } from '@/lib/enums';

export interface ApprovalChainRow {
  id: string;
  name: string;
  triggerBand: RiskBand;
  active: boolean;
  steps: {
    id: string;
    order: number;
    requiredRole: Role;
    approverId: string | null;
  }[];
}

export interface ApprovalRequestRow {
  id: string;
  quoteId: string;
  chainId: string | null;
  requiredRole: Role;
  currentStep: number;
  status: ApprovalStatus;
  riskBand: RiskBand | null;
  riskScore: number | null;
  requestedById: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApprovalDecisionRow {
  id: string;
  approverId: string;
  approverName: string;
  decision: ApprovalStatus;
  step: number;
  comment: string | null;
  createdAt: string;
}

/** Band → required-role for the FIRST approval step (when no chain). */
export const BAND_DEFAULT_ROLE: Record<RiskBand, Role | null> = {
  SAFE: null, // no approval needed
  REVIEW: 'SALES_MANAGER',
  MANAGER: 'SALES_MANAGER',
  FINANCE: 'FINANCE_OPERATIONS',
};

/** Band → fallback next step role after a manager approval. */
export const BAND_NEXT_ROLE: Record<RiskBand, Role | null> = {
  SAFE: null,
  REVIEW: null,
  MANAGER: null,
  FINANCE: null,
};
