// src/app/api/health/config/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import {
  getOrCreateHealthConfig,
  updateHealthConfig,
} from '@/application/deal-health/health-service';

const Patch = z.object({
  stalledDaysThreshold: z.number().int().min(1).max(365).optional(),
  approvalSlaHours: z.number().int().min(1).max(720).optional(),
  deliverySlippageDays: z.number().int().min(0).max(60).optional(),
  discountAnomalyPpThreshold: z.number().int().min(1).max(100).optional(),
  marginDeteriorationThreshold: z.number().int().min(0).max(100).optional(),
  negotiationEscalationCount: z.number().int().min(1).max(20).optional(),
});

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const config = await getOrCreateHealthConfig();
  return NextResponse.json(config);
});

export const PUT = withErrorHandler(async (req) => {
  const session = await requireRole('ADMIN', 'FINANCE_OPERATIONS');
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const updated = await updateHealthConfig(parsed.data, session.user);
  return NextResponse.json(updated);
});
