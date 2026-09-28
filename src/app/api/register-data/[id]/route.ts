// src/app/api/register-data/[id]/route.ts — Single registration detail
// (includes activity log + audit log from register_data_db).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { withErrorHandler, NotFoundError } from '@/lib/api-error';
import {
  getRegisterById,
  getActivityLog,
  getAuditLog,
} from '@/lib/register-data-db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (!numId || Number.isNaN(numId)) {
      throw new NotFoundError('Invalid registration id');
    }

    const register = getRegisterById(numId);
    if (!register) throw new NotFoundError('Registration not found');

    const activity = getActivityLog(numId, 50);
    const audit = getAuditLog(numId, 50);

    // Strip the passwordHash before returning.
    const { passwordHash, ...safeRegister } = register;
    return NextResponse.json({
      data: { ...safeRegister, activity, audit },
    });
  })();
}
