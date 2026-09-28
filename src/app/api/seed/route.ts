// src/app/api/seed/route.ts — Deterministic, idempotent demo seed.
// Builds the complete flagship demo: customers, products, warehouses,
// discount rules, approval chains, historical quotes, subscriptions.
// Safe to call repeatedly — upserts by stable natural keys (name, sku, code).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/services/auth/password';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';
import { appConfig } from '@/lib/config';

const DEMO_PASSWORD = appConfig.demoPassword;

export const POST = withErrorHandler(async () => {
  await requireRole('ADMIN', 'SALES_MANAGER', 'FINANCE_OPERATIONS');
  const result = {
    users: 0,
    customers: 0,
    products: 0,
    categories: 0,
    priceLists: 0,
    warehouses: 0,
    discountRules: 0,
    approvalChains: 0,
    subscriptionPlans: 0,
    quotes: 0,
    purchaseHistory: 0,
    productAssociations: 0,
  };

  // 1. Categories
  const categories = await ensureCategories();
  result.categories = categories.length;

  // 2. Products
  const products = await ensureProducts(categories);
  result.products = products.length;

  // 3. Warehouses
  const warehouses = await ensureWarehouses();
  result.warehouses = warehouses.length;

  // 4. Warehouse stock
  await ensureWarehouseStock(warehouses, products);

  // 5. Customers
  const customers = await ensureCustomers();
  result.customers = customers.length;

  // 6. Users (5 demo accounts + customer user)
  await ensureUsers(customers);
  result.users = 6;

  // 7. Discount rules (the flagship: Gold → Hardware 15%, Services 10%)
  await ensureDiscountRules(categories, products);
  result.discountRules = 6;

  // 8. Approval chains
  await ensureApprovalChains();
  result.approvalChains = 3;

  // 9. Subscription plans
  await ensureSubscriptionPlans(products);
  result.subscriptionPlans = 3;

  // 10. Price lists
  await ensurePriceLists(products);
  result.priceLists = 1;

  // 11. Product associations (Laptop + Docking Station strong co-purchase)
  await ensureProductAssociations(products);
  result.productAssociations = 4;

  // 12. Purchase history (co-purchase signals)
  await ensurePurchaseHistory(customers, products);
  result.purchaseHistory = 8;

  // 13. Historical quotes in various states
  await ensureHistoricalQuotes(customers, products, categories);
  result.quotes = 5;

  return NextResponse.json({ ok: true, result });
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function ensureCategories() {
  const names = ['Hardware', 'Accessories', 'Services', 'Subscriptions'];
  const out: { id: string; name: string }[] = [];
  for (const name of names) {
    let row = await db.productCategory.findUnique({ where: { name } });
    if (!row) row = await db.productCategory.create({ data: { name } });
    out.push(row);
  }
  return out;
}

async function ensureProducts(cats: { id: string; name: string }[]) {
  const byName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const defs = [
    { name: 'Aurora Laptop Pro', sku: 'LAP-001', cat: 'Hardware', cost: 80000, list: 129900, billing: 'ONE_TIME' as const },
    { name: 'Ergo Docking Station', sku: 'DOC-001', cat: 'Accessories', cost: 4500, list: 8900, billing: 'ONE_TIME' as const },
    { name: 'Pulse Headset Pro', sku: 'AUD-001', cat: 'Accessories', cost: 3000, list: 6900, billing: 'ONE_TIME' as const },
    { name: 'Ergo Mouse Wireless', sku: 'MOU-001', cat: 'Accessories', cost: 1500, list: 3900, billing: 'ONE_TIME' as const },
    { name: 'Setup Service', sku: 'SVC-001', cat: 'Services', cost: 2500, list: 5000, billing: 'ONE_TIME' as const },
    { name: 'Premium Support', sku: 'SUB-001', cat: 'Subscriptions', cost: 5000, list: 12000, billing: 'RECURRING' as const, interval: 'MONTHLY' as const },
    { name: 'Premium Support Quarterly', sku: 'SUB-002', cat: 'Subscriptions', cost: 14000, list: 33000, billing: 'RECURRING' as const, interval: 'QUARTERLY' as const },
    { name: 'Premium Support Annual', sku: 'SUB-003', cat: 'Subscriptions', cost: 50000, list: 120000, billing: 'RECURRING' as const, interval: 'ANNUAL' as const },
  ];

  const out: { id: string; name: string; sku: string }[] = [];
  for (const d of defs) {
    let row = await db.product.findUnique({ where: { sku: d.sku } });
    if (!row) {
      row = await db.product.create({
        data: {
          name: d.name,
          sku: d.sku,
          description: `${d.name} — premium quality`,
          categoryId: byName[d.cat],
          costCents: d.cost,
          listPriceCents: d.list,
          billingType: d.billing,
          defaultInterval: d.billing === 'RECURRING' ? d.interval : null,
          defaultIntervalCount: d.billing === 'RECURRING' ? 1 : null,
          active: true,
        },
      });
    }
    out.push({ id: row.id, name: row.name, sku: row.sku });
  }
  return out;
}

async function ensureWarehouses() {
  const defs = [
    { name: 'Main Warehouse', code: 'WH-MAIN', region: 'West', shipping: 1500 },
    { name: 'East Depot', code: 'WH-EAST', region: 'East', shipping: 1200 },
    { name: 'West Distribution', code: 'WH-WEST', region: 'West', shipping: 1000 },
  ];
  const out: { id: string; name: string; code: string }[] = [];
  for (const d of defs) {
    let row = await db.warehouse.findUnique({ where: { code: d.code } });
    if (!row) {
      row = await db.warehouse.create({
        data: { name: d.name, code: d.code, region: d.region, shippingCostCents: d.shipping, active: true },
      });
    }
    out.push({ id: row.id, name: row.name, code: row.code });
  }
  return out;
}

async function ensureWarehouseStock(
  warehouses: { id: string; name: string; code: string }[],
  products: { id: string; name: string; sku: string }[],
) {
  // Aurora Laptop: Main has 1, East has 2, West has 0 (forces a split for qty 3)
  const stockMap: Record<string, Record<string, number>> = {
    'LAP-001': { 'WH-MAIN': 1, 'WH-EAST': 2, 'WH-WEST': 0 },
    'DOC-001': { 'WH-MAIN': 5, 'WH-EAST': 10, 'WH-WEST': 8 },
    'AUD-001': { 'WH-MAIN': 3, 'WH-EAST': 2, 'WH-WEST': 5 },
    'MOU-001': { 'WH-MAIN': 8, 'WH-EAST': 12, 'WH-WEST': 10 },
    'SVC-001': { 'WH-MAIN': 99, 'WH-EAST': 99, 'WH-WEST': 99 },
  };
  const whByCode = Object.fromEntries(warehouses.map((w) => [w.code, w.id]));
  const prodBySku = Object.fromEntries(products.map((p) => [p.sku, p.id]));

  for (const [sku, perWh] of Object.entries(stockMap)) {
    for (const [whCode, qty] of Object.entries(perWh)) {
      const warehouseId = whByCode[whCode];
      const productId = prodBySku[sku];
      if (!warehouseId || !productId) continue;
      await db.warehouseStock.upsert({
        where: { warehouseId_productId: { warehouseId, productId } },
        create: { warehouseId, productId, quantity: qty },
        update: { quantity: qty },
      });
    }
  }
}

async function ensureCustomers() {
  const defs = [
    { name: 'Acme Corp', tier: 'GOLD', email: 'ap@acme.io' },
    { name: 'Beta Industries', tier: 'SILVER', email: 'contact@beta.io' },
    { name: 'Nova Retail', tier: 'BRONZE', email: 'hello@nova.io' },
  ];
  const out: { id: string; name: string; tier: string }[] = [];
  for (const d of defs) {
    let row = await db.customer.findFirst({ where: { name: d.name } });
    if (!row) {
      row = await db.customer.create({
        data: { name: d.name, tier: d.tier, email: d.email, currency: 'INR', active: true },
      });
    } else {
      // ensure tier is set correctly
      row = await db.customer.update({ where: { id: row.id }, data: { tier: d.tier, active: true } });
    }
    out.push({ id: row.id, name: row.name, tier: row.tier });
  }
  return out;
}

async function ensureUsers(customers: { id: string; name: string; tier: string }[]) {
  const acme = customers.find((c) => c.name === 'Acme Corp')!;
  const defs = [
    { email: 'alex@dealflow360.io', name: 'Alex Rivera', role: 'SALES_REP', customerId: null },
    { email: 'morgan@dealflow360.io', name: 'Morgan Chen', role: 'SALES_MANAGER', customerId: null },
    { email: 'finn@dealflow360.io', name: 'Finn Ops', role: 'FINANCE_OPERATIONS', customerId: null },
    { email: 'admin@dealflow360.io', name: 'Avery Admin', role: 'ADMIN', customerId: null },
    { email: 'casey@acme.io', name: 'Casey Acme', role: 'CUSTOMER', customerId: acme.id },
  ];
  for (const d of defs) {
    const existing = await db.user.findUnique({ where: { email: d.email } });
    if (existing) {
      // ensure role + customerId are correct
      await db.user.update({
        where: { id: existing.id },
        data: { role: d.role, customerId: d.customerId, active: true, passwordHash: hashPassword(DEMO_PASSWORD) },
      });
    } else {
      await db.user.create({
        data: {
          email: d.email,
          name: d.name,
          role: d.role,
          customerId: d.customerId,
          passwordHash: hashPassword(DEMO_PASSWORD),
          active: true,
        },
      });
    }
  }
  // Assign Acme to Alex (sales rep)
  const alex = await db.user.findUnique({ where: { email: 'alex@dealflow360.io' } });
  if (alex) {
    await db.customer.update({ where: { id: acme.id }, data: { assignedRepId: alex.id } });
  }
}

async function ensureDiscountRules(
  cats: { id: string; name: string }[],
  products: { id: string; name: string; sku: string }[],
) {
  const hardware = cats.find((c) => c.name === 'Hardware')!.id;
  const accessories = cats.find((c) => c.name === 'Accessories')!.id;
  const services = cats.find((c) => c.name === 'Services')!.id;
  const subscriptions = cats.find((c) => c.name === 'Subscriptions')!.id;
  const setupService = products.find((p) => p.sku === 'SVC-001')!.id;

  const rules = [
    { name: 'Gold · Hardware', tier: 'GOLD', categoryId: hardware, max: 15, warn: 10, priority: 50 },
    { name: 'Gold · Services', tier: 'GOLD', categoryId: services, max: 10, warn: 5, priority: 50 },
    { name: 'Gold · Accessories', tier: 'GOLD', categoryId: accessories, max: 20, warn: 15, priority: 50 },
    { name: 'Gold · Subscriptions', tier: 'GOLD', categoryId: subscriptions, max: 25, warn: 20, priority: 50 },
    { name: 'Silver · Default', tier: 'SILVER', categoryId: null, max: 10, warn: 5, priority: 20 },
    { name: 'Setup Service · 5% hard cap (product-specific)', tier: null, categoryId: null, productId: setupService, max: 5, warn: 3, priority: 100 },
  ];

  for (const r of rules) {
    const existing = await db.discountRule.findFirst({ where: { name: r.name } });
    if (existing) {
      await db.discountRule.update({
        where: { id: existing.id },
        data: {
          customerTier: r.tier,
          categoryId: r.categoryId,
          productId: r.productId ?? null,
          maxPercent: r.max,
          warnPercent: r.warn,
          priority: r.priority,
          active: true,
        },
      });
    } else {
      await db.discountRule.create({
        data: {
          name: r.name,
          customerTier: r.tier,
          categoryId: r.categoryId,
          productId: r.productId ?? null,
          maxPercent: r.max,
          warnPercent: r.warn,
          priority: r.priority,
          active: true,
        },
      });
    }
  }
}

async function ensureApprovalChains() {
  // Manager chain (REVIEW/MANAGER bands)
  const managerExisting = await db.approvalChain.findFirst({ where: { name: 'Manager Approval' } });
  if (!managerExisting) {
    await db.approvalChain.create({
      data: {
        name: 'Manager Approval',
        triggerBand: 'REVIEW',
        active: true,
        steps: {
          create: [{ order: 1, requiredRole: 'SALES_MANAGER' }],
        },
      },
    });
  }
  // Finance chain (FINANCE band)
  const financeExisting = await db.approvalChain.findFirst({ where: { name: 'Finance Approval' } });
  if (!financeExisting) {
    await db.approvalChain.create({
      data: {
        name: 'Finance Approval',
        triggerBand: 'FINANCE',
        active: true,
        steps: {
          create: [
            { order: 1, requiredRole: 'SALES_MANAGER' },
            { order: 2, requiredRole: 'FINANCE_OPERATIONS' },
          ],
        },
      },
    });
  }
  // Manager-only (MANAGER band)
  const managerOnlyExisting = await db.approvalChain.findFirst({ where: { name: 'Manager Only' } });
  if (!managerOnlyExisting) {
    await db.approvalChain.create({
      data: {
        name: 'Manager Only',
        triggerBand: 'MANAGER',
        active: true,
        steps: { create: [{ order: 1, requiredRole: 'SALES_MANAGER' }] },
      },
    });
  }
}

async function ensureSubscriptionPlans(products: { id: string; name: string; sku: string }[]) {
  const premiumMonthly = products.find((p) => p.sku === 'SUB-001')!.id;
  const premiumQuarterly = products.find((p) => p.sku === 'SUB-002')!.id;
  const premiumAnnual = products.find((p) => p.sku === 'SUB-003')!.id;

  const plans = [
    { name: 'Premium Support Monthly', interval: 'MONTHLY', count: 1, price: 12000, productId: premiumMonthly },
    { name: 'Premium Support Quarterly', interval: 'QUARTERLY', count: 1, price: 33000, productId: premiumQuarterly },
    { name: 'Premium Support Annual', interval: 'ANNUAL', count: 1, price: 120000, productId: premiumAnnual },
  ];

  for (const p of plans) {
    const existing = await db.subscriptionPlan.findFirst({ where: { name: p.name } });
    if (!existing) {
      await db.subscriptionPlan.create({ data: { name: p.name, interval: p.interval, intervalCount: p.count, priceCents: p.price, active: true } });
    }
  }
}

async function ensurePriceLists(products: { id: string; name: string; sku: string }[]) {
  // One default price list that matches the product list prices.
  let list = await db.priceList.findFirst({ where: { isDefault: true } });
  if (!list) {
    list = await db.priceList.create({ data: { name: 'Default List', currency: 'INR', isDefault: true, active: true } });
  }
  for (const p of products) {
    const product = await db.product.findUnique({ where: { id: p.id } });
    if (!product) continue;
    await db.priceListItem.upsert({
      where: { priceListId_productId: { priceListId: list.id, productId: p.id } },
      create: { priceListId: list.id, productId: p.id, unitPriceCents: product.listPriceCents, active: true },
      update: { unitPriceCents: product.listPriceCents, active: true },
    });
  }
}

async function ensureProductAssociations(products: { id: string; name: string; sku: string }[]) {
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p.id]));
  const pairs: [string, string, number][] = [
    // Laptop + Docking Station = strong co-purchase (92)
    ['LAP-001', 'DOC-001', 92],
    ['DOC-001', 'LAP-001', 70],
    // Laptop + Headset
    ['LAP-001', 'AUD-001', 65],
    ['LAP-001', 'MOU-001', 60],
  ];
  for (const [primarySku, relatedSku, strength] of pairs) {
    const primaryId = bySku[primarySku];
    const relatedId = bySku[relatedSku];
    if (!primaryId || !relatedId) continue;
    const existing = await db.productAssociation.findUnique({
      where: { primaryId_relatedId: { primaryId, relatedId } },
    });
    if (!existing) {
      await db.productAssociation.create({ data: { primaryId, relatedId, strength } });
    } else {
      await db.productAssociation.update({
        where: { id: existing.id },
        data: { strength },
      });
    }
  }
}

async function ensurePurchaseHistory(
  customers: { id: string; name: string; tier: string }[],
  products: { id: string; name: string; sku: string }[],
) {
  const acme = customers.find((c) => c.name === 'Acme Corp')!.id;
  const beta = customers.find((c) => c.name === 'Beta Industries')!.id;
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p.id]));
  const events: [string, string, number, Date][] = [
    // Acme bought Laptop + Docking Station together 3 months ago (co-purchase)
    [acme, 'LAP-001', 5, new Date(Date.now() - 90 * 86400_000)],
    [acme, 'DOC-001', 8, new Date(Date.now() - 90 * 86400_000)],
    [acme, 'AUD-001', 3, new Date(Date.now() - 60 * 86400_000)],
    [acme, 'SVC-001', 2, new Date(Date.now() - 30 * 86400_000)],
    // Beta bought Laptop + Headset
    [beta, 'LAP-001', 3, new Date(Date.now() - 120 * 86400_000)],
    [beta, 'AUD-001', 4, new Date(Date.now() - 120 * 86400_000)],
    [beta, 'MOU-001', 6, new Date(Date.now() - 45 * 86400_000)],
    [beta, 'DOC-001', 2, new Date(Date.now() - 30 * 86400_000)],
  ];
  for (const [customerId, sku, qty, purchasedAt] of events) {
    const productId = bySku[sku];
    if (!productId) continue;
    // Avoid duplicates
    const existing = await db.purchaseEvent.findFirst({
      where: { customerId, productId, purchasedAt },
    });
    if (!existing) {
      await db.purchaseEvent.create({ data: { customerId, productId, qty, purchasedAt } });
    }
  }
}

async function ensureHistoricalQuotes(
  customers: { id: string; name: string; tier: string }[],
  products: { id: string; name: string; sku: string }[],
  cats: { id: string; name: string }[],
) {
  const alex = await db.user.findUnique({ where: { email: 'alex@dealflow360.io' } });
  if (!alex) return;
  const acme = customers.find((c) => c.name === 'Acme Corp')!;
  const beta = customers.find((c) => c.name === 'Beta Industries')!;
  const nova = customers.find((c) => c.name === 'Nova Retail')!;

  const bySku = Object.fromEntries(products.map((p) => [p.sku, p.id]));
  const byName = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  // Find existing historical quotes by their numbers; only create if missing.
  const existingNumbers = new Set(
    (await db.quote.findMany({ where: { number: { startsWith: 'DEMO-' } } })).map((q) => q.number),
  );

  const historical: {
    number: string;
    customer: { id: string; tier: string };
    status: string;
    lines: { sku: string; qty: number; discount: number }[];
    createdAt: Date;
  }[] = [
    // Approved + Confirmed + Fulfilled flagship demo (Acme)
    {
      number: 'DEMO-0001',
      customer: acme,
      status: 'FULFILLED',
      lines: [
        { sku: 'LAP-001', qty: 3, discount: 12 },
        { sku: 'SVC-001', qty: 1, discount: 18 }, // 8pp overage → MANAGER
      ],
      createdAt: new Date(Date.now() - 30 * 86400_000),
    },
    // Pending manager (Acme)
    {
      number: 'DEMO-0002',
      customer: acme,
      status: 'PENDING_MANAGER',
      lines: [
        { sku: 'LAP-001', qty: 2, discount: 10 },
        { sku: 'DOC-001', qty: 2, discount: 15 },
      ],
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    // Pending finance (Beta, high discount)
    {
      number: 'DEMO-0003',
      customer: beta,
      status: 'PENDING_FINANCE',
      lines: [
        { sku: 'LAP-001', qty: 5, discount: 25 },
      ],
      createdAt: new Date(Date.now() - 4 * 86400_000),
    },
    // Approved but not confirmed (Nova)
    {
      number: 'DEMO-0004',
      customer: nova,
      status: 'APPROVED',
      lines: [
        { sku: 'MOU-001', qty: 10, discount: 8 },
        { sku: 'AUD-001', qty: 5, discount: 10 },
      ],
      createdAt: new Date(Date.now() - 7 * 86400_000),
    },
    // Stalled draft (Nova)
    {
      number: 'DEMO-0005',
      customer: nova,
      status: 'DRAFT',
      lines: [
        { sku: 'MOU-001', qty: 4, discount: 5 },
      ],
      createdAt: new Date(Date.now() - 14 * 86400_000),
    },
  ];

  for (const h of historical) {
    if (existingNumbers.has(h.number)) continue;
    const quote = await db.quote.create({
      data: {
        number: h.number,
        customerId: h.customer.id,
        ownerId: alex.id,
        status: h.status,
        revision: 1,
        currency: 'INR',
        taxPercent: 0,
        createdAt: h.createdAt,
        updatedAt: h.createdAt,
        submittedAt: h.status !== 'DRAFT' ? h.createdAt : null,
        confirmedAt: h.status === 'FULFILLED' ? new Date(h.createdAt.getTime() + 86400_000) : null,
      },
    });

    // Lines
    let subtotalCents = 0;
    let discountCents = 0;
    let costCents = 0;
    for (const l of h.lines) {
      const product = await db.product.findUnique({
        where: { id: bySku[l.sku] },
        include: { category: true },
      });
      if (!product) continue;
      const unitPrice = product.listPriceCents;
      const gross = l.qty * unitPrice;
      const discount = Math.round((gross * l.discount) / 100);
      const net = gross - discount;
      const cost = product.costCents ? l.qty * product.costCents : 0;
      const margin = net - cost;
      subtotalCents += gross;
      discountCents += discount;
      costCents += cost;
      await db.quoteLine.create({
        data: {
          quoteId: quote.id,
          productId: product.id,
          productName: product.name,
          billingType: product.billingType,
          interval: product.defaultInterval,
          intervalCount: product.defaultIntervalCount,
          qty: l.qty,
          unitPriceCents: unitPrice,
          discountPercent: l.discount,
          grossCents: gross,
          discountCents: discount,
          netCents: net,
          costCents: product.costCents,
          marginCents: margin,
          allowedDiscountPercent: l.discount, // will be recomputed by risk eval below
        },
      });
    }

    // Update denormalized totals.
    const marginPct = subtotalCents > 0 ? Math.round(((subtotalCents - discountCents - costCents) / subtotalCents) * 100) : 0;
    await db.quote.update({
      where: { id: quote.id },
      data: {
        subtotalCents,
        discountCents,
        taxCents: 0,
        totalCents: subtotalCents - discountCents,
        estimatedCostCents: costCents,
        estimatedMarginPct: marginPct,
      },
    });
  }
}
