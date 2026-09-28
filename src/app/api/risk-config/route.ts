// src/app/api/risk-config/route.ts — Active risk config GET/PUT.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, ValidationError } from '@/lib/api-error';
import { UpdateRiskConfigSchema } from '@/lib/schemas/master-data';
import { audit } from '@/services/audit/audit';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
  const config = await getOrCreateRiskConfig();
  return NextResponse.json(config);
});

export const PUT = withErrorHandler(async (req) => {
  const session = await requireRole('ADMIN', 'SALES_MANAGER', 'FINANCE_OPERATIONS');
  const json = await req.json().catch(() => ({}));
  const parsed = UpdateRiskConfigSchema.safeParse(json);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const existing = await getOrCreateRiskConfig();
  const updated = await db.riskConfig.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    actorName: session.user.name,
    entityType: 'riskConfig',
    entityId: updated.id,
    action: 'riskConfig.update',
    oldValue: { safeMax: existing.safeMax, reviewMax: existing.reviewMax, managerMax: existing.managerMax },
    newValue: { safeMax: updated.safeMax, reviewMax: updated.reviewMax, managerMax: updated.managerMax },
  });
  return NextResponse.json(updated);
});

/** Lazily create the default risk config if it does not yet exist. */
export async function getOrCreateRiskConfig() {
  let config = await db.riskConfig.findFirst({ where: { active: true } });
  if (!config) {
    config = await db.riskConfig.create({ data: { name: 'default', active: true } });
  }
  return config;
}
