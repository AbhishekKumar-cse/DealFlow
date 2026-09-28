// src/app/api/auth/seed-demo/route.ts — Idempotent seed of the 5 demo accounts.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/services/auth/password';
import { withErrorHandler } from '@/lib/api-error';
import { appConfig } from '@/lib/config';

const DEMO_PASSWORD = appConfig.demoPassword;

const DEMO_USERS = [
  { email: 'alex@dealflow360.io', name: 'Alex Rivera', role: 'SALES_REP' as const },
  { email: 'morgan@dealflow360.io', name: 'Morgan Chen', role: 'SALES_MANAGER' as const },
  { email: 'finn@dealflow360.io', name: 'Finn Ops', role: 'FINANCE_OPERATIONS' as const },
  { email: 'admin@dealflow360.io', name: 'Avery Admin', role: 'ADMIN' as const },
];

export const POST = withErrorHandler(async () => {
  const customers = await ensureDemoCustomers();

  const casey = await db.user.upsert({
    where: { email: 'casey@acme.io' },
    create: {
      email: 'casey@acme.io',
      name: 'Casey Acme',
      passwordHash: hashPassword(DEMO_PASSWORD),
      role: 'CUSTOMER',
      customerId: customers.acme.id,
    },
    update: {},
  });

  const internal = [];
  for (const u of DEMO_USERS) {
    const created = await db.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: hashPassword(DEMO_PASSWORD),
        role: u.role,
      },
      update: {},
    });
    internal.push(created);
  }

  return NextResponse.json({
    password: DEMO_PASSWORD,
    users: [
      ...internal.map((u) => ({ email: u.email, name: u.name, role: u.role })),
      { email: casey.email, name: casey.name, role: casey.role, customerId: casey.customerId },
    ],
  });
});

async function ensureDemoCustomers() {
  // Phase 04 will replace this with full customer CRUD; for now, minimal
  // rows so the CUSTOMER user has an organization.
  let acme = await db.customer.findFirst({ where: { name: 'Acme Corp' } });
  if (!acme) {
    acme = await db.customer.create({
      data: { name: 'Acme Corp', tier: 'GOLD', email: 'ap@acme.io' },
    });
  }
  return { acme };
}
