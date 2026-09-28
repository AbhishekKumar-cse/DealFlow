// src/services/audit/audit.ts — Append-only audit event writer.
//
// Audit events are immutable: there is no update/delete API. Phase 14 will add
// a richer query surface and the timeline UI; this writer is sufficient for
// every other phase to emit structured audit events.

import { db } from '@/lib/db';
import type { Role } from '@/lib/enums';

export interface AuditInput {
  actorId?: string;
  actorRole?: Role | string;
  actorName?: string;
  entityType: string;
  entityId?: string;
  quoteId?: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  correlationId?: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: (input.actorRole as string) ?? null,
        actorName: input.actorName ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        quoteId: input.quoteId ?? null,
        action: input.action,
        oldValue: serialize(input.oldValue),
        newValue: serialize(input.newValue),
        reason: input.reason ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  } catch (err) {
    // Audit failure must NOT break the business operation. Log only.
    console.error('[audit] failed to write event', input.action, err);
  }
}

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
