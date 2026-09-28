// src/app/api/seed/bulk/route.ts — Generate ~200 random test records.
// Creates random customers, quotes (with lines), invoices, and subscriptions
// across all statuses so the dashboard has realistic volume. Idempotent-ish:
// each call appends new records (with a BULK- prefix on quote numbers).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { evaluateQuoteRisk } from '@/application/risk/risk-service';

// Seeded pseudo-random for determinism within a single call.
let _seed = Date.now() % 2147483647;
function rand(): number {
  _seed = (_seed * 16807) % 2147483647;
  return _seed / 2147483647;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const CUSTOMER_NAMES = [
  'Globex Corp', 'Initech', 'Umbrella LLC', 'Stark Industries', 'Wayne Enterprises',
  'Acme Holdings', 'Cyberdyne Systems', 'Soylent Co', 'Hooli', 'Pied Piper',
  'Vandelay Industries', 'Vehement Capital', 'Massive Dynamic', 'Lumon Industries',
  'Wonka Industries', 'Nakatomi Trading', 'Gringotts Bank', 'Tyrell Corp',
  'Weyland-Yutani', 'Primatech Paper',
];

const FIRST_NAMES = ['Aisha', 'Bilal', 'Camila', 'Dmitri', 'Esme', 'Farouk', 'Greta', 'Hiro', 'Ines', 'Joaquin', 'Kira', 'Lars', 'Mira', 'Niko', 'Oksana', 'Pria', 'Quinn', 'Rafa', 'Sora', 'Tomas'];
const LAST_NAMES = ['Okafor', 'Petrov', 'Quintos', 'Rashid', 'Sandoval', 'Tanaka', 'Ueda', 'Vargas', 'Wojcik', 'Xu', 'Yusuf', 'Zaragoza', 'Anders', 'Bauer', 'Costa', 'Demir', 'Egan', 'Ferro', 'Garrido', 'Hayek'];

const STATUSES_DISTRIBUTION = [
  'DRAFT', 'DRAFT', 'DRAFT', 'SUBMITTED',
  'PENDING_MANAGER', 'PENDING_MANAGER',
  'PENDING_FINANCE',
  'APPROVED', 'APPROVED',
  'CONFIRMED', 'FULFILLING', 'FULFILLED', 'FULFILLED',
  'REJECTED', 'CANCELLED',
];

export const POST = withErrorHandler(async () => {
  await requireRole('ADMIN', 'SALES_MANAGER', 'FINANCE_OPERATIONS');

  const counts = {
    customers: 0,
    quotes: 0,
    quoteLines: 0,
    invoices: 0,
    subscriptions: 0,
    approvalRequests: 0,
    healthEvents: 0,
    total: 0,
  };

  // Load existing reference data.
  const products = await db.product.findMany({ where: { active: true }, include: { category: true } });
  if (products.length === 0) throw new Error('No products found — run the demo seed first.');
  const categories = await db.productCategory.findMany();
  const recurringProducts = products.filter((p) => p.billingType === 'RECURRING');
  const oneTimeProducts = products.filter((p) => p.billingType === 'ONE_TIME');
  const users = await db.user.findMany({ where: { active: true } });
  const reps = users.filter((u) => u.role === 'SALES_REP');
  const managers = users.filter((u) => u.role === 'SALES_MANAGER');
  const financeUsers = users.filter((u) => u.role === 'FINANCE_OPERATIONS');
  if (reps.length === 0) throw new Error('No sales reps found — run the demo seed first.');

  // ── 20 random customers ──────────────────────────────────────────────
  const tierChoices = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  const tierWeights = [0.4, 0.35, 0.2, 0.05]; // mostly bronze/silver
  function weightedTier(): string {
    const r = rand();
    let acc = 0;
    for (let i = 0; i < tierChoices.length; i++) {
      acc += tierWeights[i];
      if (r <= acc) return tierChoices[i];
    }
    return 'BRONZE';
  }
  const newCustomers: { id: string; name: string; tier: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const baseName = pick(CUSTOMER_NAMES);
    const suffix = `#${1000 + randInt(0, 8999)}`;
    const name = `${baseName} ${suffix}`;
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`;
    const tier = weightedTier();
    const rep = pick(reps);
    const customer = await db.customer.create({
      data: {
        name,
        tier,
        email,
        phone: `+1-${randInt(200, 999)}-${randInt(2000000, 9999999)}`,
        currency: 'INR',
        assignedRepId: rep.id,
        active: true,
      },
    });
    newCustomers.push({ id: customer.id, name: customer.name, tier: customer.tier });
    counts.customers++;
  }

  // Combine with existing customers for quote generation.
  const allCustomers = [
    ...newCustomers,
    ...(await db.customer.findMany({ where: { active: true }, select: { id: true, name: true, tier: true } })),
  ];

  // ── 100 random quotes ────────────────────────────────────────────────
  const bulkYear = new Date().getFullYear();
  let bulkSeq = 1;
  const existingBulk = await db.quote.count({ where: { number: { startsWith: `BULK-${bulkYear}-` } } });
  bulkSeq = existingBulk + 1;

  for (let i = 0; i < 100; i++) {
    const customer = pick(allCustomers);
    const rep = pick(reps);
    const status = pick(STATUSES_DISTRIBUTION);
    const lineCount = randInt(1, 4);
    const createdAt = new Date(Date.now() - randInt(1, 90) * 86400_000);
    const taxPercent = pick([0, 0, 0, 5, 8, 10]);

    const quote = await db.quote.create({
      data: {
        number: `BULK-${bulkYear}-${String(bulkSeq++).padStart(4, '0')}`,
        customerId: customer.id,
        ownerId: rep.id,
        status,
        revision: 1,
        currency: 'INR',
        taxPercent,
        createdAt,
        updatedAt: createdAt,
        submittedAt: status !== 'DRAFT' && status !== 'CANCELLED' ? createdAt : null,
        confirmedAt: ['CONFIRMED', 'FULFILLING', 'FULFILLED'].includes(status) ? new Date(createdAt.getTime() + 86400_000) : null,
        notes: rand() < 0.3 ? 'Generated bulk quote for dashboard volume testing.' : null,
      },
    });
    counts.quotes++;

    // Lines
    let subtotalCents = 0;
    let discountCents = 0;
    let costCents = 0;
    const chosenProductIds = new Set<string>();
    for (let l = 0; l < lineCount; l++) {
      let product = pick(products);
      // Avoid duplicate products in the same quote.
      let attempts = 0;
      while (chosenProductIds.has(product.id) && attempts < 5) {
        product = pick(products);
        attempts++;
      }
      chosenProductIds.add(product.id);

      const qty = randInt(1, 10);
      const unitPrice = product.listPriceCents;
      // Random discount — some breach ceilings (gold tier + hardware 15%).
      const discountChoices = [0, 5, 8, 10, 12, 15, 18, 20, 25, 30];
      const discount = pick(discountChoices);
      const gross = qty * unitPrice;
      const disc = Math.round((gross * discount) / 100);
      const net = gross - disc;
      const cost = product.costCents ? qty * product.costCents : 0;
      const margin = net - cost;

      await db.quoteLine.create({
        data: {
          quoteId: quote.id,
          productId: product.id,
          productName: product.name,
          billingType: product.billingType,
          interval: product.defaultInterval,
          intervalCount: product.defaultIntervalCount,
          qty,
          unitPriceCents: unitPrice,
          discountPercent: discount,
          grossCents: gross,
          discountCents: disc,
          netCents: net,
          costCents: product.costCents,
          marginCents: margin,
        },
      });
      counts.quoteLines++;
      subtotalCents += gross;
      discountCents += disc;
      costCents += cost;
    }

    // Update denormalized totals.
    const taxCents = Math.round(((subtotalCents - discountCents) * taxPercent) / 100);
    const totalCents = subtotalCents - discountCents + taxCents;
    const marginPct = subtotalCents > 0 ? Math.round(((subtotalCents - discountCents - costCents) / subtotalCents) * 100) : 0;
    await db.quote.update({
      where: { id: quote.id },
      data: {
        subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        estimatedCostCents: costCents,
        estimatedMarginPct: marginPct,
      },
    });

    // For non-DRAFT quotes, evaluate risk (persists snapshot + per-line allowedDiscountPercent).
    if (status !== 'DRAFT' && status !== 'CANCELLED') {
      try {
        const risk = await evaluateQuoteRisk(quote.id);
        // For pending statuses, create an approval request.
        if (status === 'PENDING_MANAGER' || status === 'PENDING_FINANCE') {
          const requiredRole = status === 'PENDING_FINANCE' ? 'FINANCE_OPERATIONS' : 'SALES_MANAGER';
          await db.approvalRequest.create({
            data: {
              quoteId: quote.id,
              requiredRole,
              currentStep: 1,
              status: 'PENDING',
              riskBand: risk.band,
              riskScore: risk.score,
              requestedById: rep.id,
              createdAt,
            },
          });
          counts.approvalRequests++;
        }
      } catch {
        // Risk eval may fail if rules are missing — continue.
      }
    }
  }

  // ── 50 random invoices ───────────────────────────────────────────────
  let invSeq = (await db.invoice.count({ where: { number: { startsWith: `INV-${bulkYear}-B` } } })) + 1;
  const invoiceStatuses = ['DRAFT', 'ISSUED', 'ISSUED', 'PAID', 'PAID', 'PARTIAL', 'OVERDUE', 'VOID'];
  const paidCustomers = await db.customer.findMany({ where: { active: true }, select: { id: true } });
  for (let i = 0; i < 50; i++) {
    const customer = pick(paidCustomers);
    const product = pick(oneTimeProducts);
    const status = pick(invoiceStatuses);
    const qty = randInt(1, 5);
    const unitPrice = product.listPriceCents;
    const discount = pick([0, 5, 10, 15]);
    const gross = qty * unitPrice;
    const disc = Math.round((gross * discount) / 100);
    const net = gross - disc;
    const taxCents = Math.round((net * 8) / 100);
    const totalCents = net + taxCents;
    const issueDate = new Date(Date.now() - randInt(1, 60) * 86400_000);
    const dueDate = new Date(issueDate.getTime() + 30 * 86400_000);
    const paidCents = status === 'PAID' ? totalCents : status === 'PARTIAL' ? Math.round(totalCents / 2) : 0;

    const invoice = await db.invoice.create({
      data: {
        number: `INV-${bulkYear}-B${String(invSeq++).padStart(4, '0')}`,
        customerId: customer.id,
        type: 'ONE_TIME',
        status,
        issueDate,
        dueDate,
        subtotalCents: gross,
        discountCents: disc,
        taxCents,
        totalCents,
        paidCents,
        currency: 'INR',
      },
    });
    counts.invoices++;
    await db.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        productId: product.id,
        description: product.name,
        qty,
        unitPriceCents: unitPrice,
        discountPercent: discount,
        grossCents: gross,
        discountCents: disc,
        netCents: net,
      },
    });
    if (paidCents > 0) {
      await db.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: paidCents,
          method: pick(['SIMULATED', 'BANK_TRANSFER', 'CARD', 'WIRE']),
          status: 'COMPLETED',
          paidAt: new Date(issueDate.getTime() + randInt(1, 20) * 86400_000),
        },
      });
    }
  }

  // ── 30 random subscriptions ─────────────────────────────────────────
  if (recurringProducts.length > 0) {
    for (let i = 0; i < 30; i++) {
      const customer = pick(paidCustomers);
      const product = pick(recurringProducts);
      const interval = product.defaultInterval ?? 'MONTHLY';
      const intervalCount = product.defaultIntervalCount ?? 1;
      const priceCents = product.listPriceCents;
      const startDate = new Date(Date.now() - randInt(1, 365) * 86400_000);
      const nextBilling = new Date(startDate.getTime() + (interval === 'MONTHLY' ? 30 : interval === 'QUARTERLY' ? 90 : 365) * 86400_000);
      const status = pick(['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'CANCELLED']);

      await db.subscription.create({
        data: {
          customerId: customer.id,
          planId: (await db.subscriptionPlan.findFirst({ where: { name: { contains: interval === 'MONTHLY' ? 'Monthly' : interval === 'QUARTERLY' ? 'Quarterly' : 'Annual' } } }))?.id ?? '',
          productId: product.id,
          priceCents,
          interval,
          intervalCount,
          qty: 1,
          status,
          startDate,
          nextBillingDate: nextBilling,
          cancelledAt: status === 'CANCELLED' ? new Date(startDate.getTime() + 86400_000) : null,
        },
      });
      counts.subscriptions++;
    }
  }

  // ── A few random health events for visual variety ───────────────────
  const sampleQuotes = await db.quote.findMany({
    where: { status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] } },
    take: 10,
    select: { id: true },
  });
  for (const q of sampleQuotes) {
    if (rand() < 0.5) {
      await db.dealHealthEvent.create({
        data: {
          quoteId: q.id,
          type: pick(['STALLED', 'APPROVAL_SLA_BREACH', 'DISCOUNT_ANOMALY', 'MARGIN_DETERIORATION']),
          severity: pick(['INFO', 'WARN', 'CRITICAL']),
          evidence: 'Bulk-generated health alert.',
          recommendedAction: 'Investigate.',
          status: 'OPEN',
        },
      });
      counts.healthEvents++;
    }
  }

  counts.total =
    counts.customers +
    counts.quotes +
    counts.quoteLines +
    counts.invoices +
    counts.subscriptions +
    counts.approvalRequests +
    counts.healthEvents;

  return NextResponse.json({ ok: true, counts });
});
