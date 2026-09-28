import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('db/custom.db');
db.exec('PRAGMA foreign_keys = ON');
const now = new Date();
const iso = (daysAgo = 0) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
const id = (prefix, n) => `demo-${prefix}-${String(n).padStart(2, '0')}`;
const run = (sql, params = {}) => db.prepare(sql).run(params);
const one = (sql, params = {}) => db.prepare(sql).get(params);

const alex = one("SELECT id, name, role FROM User WHERE email = 'alex@dealflow360.io'");
const manager = one("SELECT id, name, role FROM User WHERE email = 'morgan@dealflow360.io'");
const finance = one("SELECT id, name, role FROM User WHERE email = 'finn@dealflow360.io'");
const products = db.prepare('SELECT id, name, sku, listPriceCents, costCents, billingType FROM Product ORDER BY sku').all();
const warehouses = db.prepare('SELECT id, code, shippingCostCents FROM Warehouse ORDER BY code').all();
if (!alex || !manager || !finance || products.length < 5 || warehouses.length < 1) {
  throw new Error('Run the main demo seed first.');
}

const customers = [
  ['demo-customer-04', 'Globex Corporation', 'GOLD', 'ops@globex.example'],
  ['demo-customer-05', 'Initech Systems', 'SILVER', 'sales@initech.example'],
  ['demo-customer-06', 'Stark Logistics', 'PLATINUM', 'procurement@stark.example'],
  ['demo-customer-07', 'Wayne Retail Group', 'BRONZE', 'buying@wayne.example'],
  ['demo-customer-08', 'Hooli Networks', 'GOLD', 'finance@hooli.example'],
];
for (const [customerId, name, tier, email] of customers) {
  run(`INSERT OR IGNORE INTO Customer (id,name,tier,email,currency,assignedRepId,active,createdAt,updatedAt)
       VALUES (:id,:name,:tier,:email,'INR',:rep,1,:createdAt,:updatedAt)`,
    { id: customerId, name, tier, email, rep: alex.id, createdAt: iso(12), updatedAt: iso(1) });
}

const allCustomers = db.prepare('SELECT id, name FROM Customer ORDER BY id').all();
const product = (sku) => products.find((p) => p.sku === sku) ?? products[0];
const warehouse = (index) => warehouses[index % warehouses.length];

const quotes = [];
for (let n = 1; n <= 5; n++) {
  const qid = id('quote', n);
  const customer = allCustomers[(n + 2) % allCustomers.length];
  const p = product(['LAP-001', 'DOC-001', 'AUD-001', 'MOU-001', 'SVC-001'][n - 1]);
  const qty = n + 1;
  const gross = qty * p.listPriceCents;
  const discount = n * 2;
  const discountCents = Math.round(gross * discount / 100);
  const net = gross - discountCents;
  const status = ['PENDING_MANAGER', 'PENDING_FINANCE', 'APPROVED', 'CONFIRMED', 'FULFILLED'][n - 1];
  run(`INSERT OR IGNORE INTO Quote (id,number,customerId,ownerId,status,revision,currency,subtotalCents,discountCents,taxCents,totalCents,estimatedCostCents,estimatedMarginPct,taxPercent,riskScore,riskBand,notes,createdAt,updatedAt,submittedAt,confirmedAt)
       VALUES (:id,:number,:customerId,:ownerId,:status,1,'INR',:gross,:discountCents,0,:net,:cost,40,0,:risk,:band,:notes,:createdAt,:updatedAt,:submittedAt,:confirmedAt)`, {
    id: qid, number: `DEMO-OPS-${String(n).padStart(4, '0')}`, customerId: customer.id, ownerId: alex.id, status,
    gross, discountCents, net, cost: qty * (p.costCents ?? 0), risk: 20 + n * 9,
    band: n < 2 ? 'REVIEW' : n === 2 ? 'FINANCE' : 'LOW', notes: 'Requested demo data',
    createdAt: iso(10 - n), updatedAt: iso(2), submittedAt: iso(9 - n), confirmedAt: n >= 4 ? iso(4 - n) : null,
  });
  run(`INSERT OR IGNORE INTO QuoteLine (id,quoteId,productId,productName,billingType,interval,intervalCount,qty,unitPriceCents,discountPercent,grossCents,discountCents,netCents,costCents,marginCents,createdAt)
       VALUES (:id,:quoteId,:productId,:productName,:billingType,:interval,:intervalCount,:qty,:unitPrice,:discount,:gross,:discountCents,:net,:cost,:margin,:createdAt)`, {
    id: id('line', n), quoteId: qid, productId: p.id, productName: p.name, billingType: p.billingType,
    interval: p.billingType === 'RECURRING' ? 'MONTHLY' : null, intervalCount: p.billingType === 'RECURRING' ? 1 : null,
    qty, unitPrice: p.listPriceCents, discount, gross, discountCents, net, cost: p.costCents, margin: net - qty * (p.costCents ?? 0), createdAt: iso(10 - n),
  });
  quotes.push({ id: qid, customerId: customer.id, p, qty, net });
}

const chains = db.prepare('SELECT id, name FROM ApprovalChain ORDER BY name').all();
for (let n = 1; n <= 5; n++) {
  const q = quotes[n - 1];
  run(`INSERT OR IGNORE INTO ApprovalRequest (id,quoteId,chainId,requiredRole,currentStep,status,riskBand,riskScore,requestedById,createdAt,resolvedAt)
       VALUES (:id,:quoteId,:chainId,:role,1,:status,:band,:score,:requestedBy,:createdAt,:resolvedAt)`, {
    id: id('approval', n), quoteId: q.id, chainId: chains[n % chains.length]?.id ?? null,
    role: n % 2 ? 'SALES_MANAGER' : 'FINANCE_OPERATIONS', status: n < 4 ? 'PENDING' : 'APPROVED', band: n < 2 ? 'REVIEW' : 'FINANCE', score: 20 + n * 9,
    requestedBy: alex.id, createdAt: iso(8 - n), resolvedAt: n < 4 ? null : iso(3 - n),
  });
}

for (let n = 1; n <= 5; n++) {
  const q = quotes[n - 1];
  const wh = warehouse(n - 1);
  const fulfilled = n === 2 ? 1 : q.qty;
  run(`INSERT OR IGNORE INTO FulfillmentOrder (id,quoteId,status,totalQty,fulfilledQty,shippingCostCents,warehousesUsed,explanation,createdAt,updatedAt,confirmedAt,primaryWarehouseId)
       VALUES (:id,:quoteId,:status,:totalQty,:fulfilledQty,:shipping,:used,:explanation,:createdAt,:updatedAt,:confirmedAt,:warehouseId)`, {
    id: id('fulfillment', n), quoteId: q.id, status: n === 2 ? 'PARTIAL' : n === 5 ? 'FULFILLED' : 'FULFILLING', totalQty: q.qty,
    fulfilledQty: fulfilled, shipping: wh.shippingCostCents, used: 1, explanation: n === 2 ? 'Partial allocation awaiting replenishment.' : 'Allocated from regional warehouse.',
    createdAt: iso(7 - n), updatedAt: iso(1), confirmedAt: iso(6 - n), warehouseId: wh.id,
  });
  run(`INSERT OR IGNORE INTO FulfillmentAllocation (id,orderId,warehouseId,productId,qty,manualOverride,reason,createdAt)
       VALUES (:id,:orderId,:warehouseId,:productId,:qty,0,:reason,:createdAt)`, {
    id: id('allocation', n), orderId: id('fulfillment', n), warehouseId: wh.id, productId: q.p.id, qty: fulfilled, reason: 'Demo allocation', createdAt: iso(6 - n),
  });
}

for (let n = 1; n <= 5; n++) {
  const q = quotes[n - 1];
  const gross = q.net;
  const tax = Math.round(gross * 0.08);
  const total = gross + tax;
  const status = ['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'DRAFT'][n - 1];
  const paid = status === 'PAID' ? total : status === 'PARTIAL' ? Math.round(total / 2) : 0;
  run(`INSERT OR IGNORE INTO Invoice (id,number,customerId,quoteId,type,status,issueDate,dueDate,subtotalCents,discountCents,taxCents,totalCents,paidCents,currency,createdAt,updatedAt)
       VALUES (:id,:number,:customerId,:quoteId,'ONE_TIME',:status,:issueDate,:dueDate,:subtotal,0,:tax,:total,:paid,'INR',:createdAt,:updatedAt)`, {
    id: id('invoice', n), number: `INV-DEMO-${String(n).padStart(4, '0')}`, customerId: q.customerId, quoteId: q.id, status,
    issueDate: iso(6 - n), dueDate: iso(-24 + n), subtotal: gross, tax, total, paid, createdAt: iso(6 - n), updatedAt: iso(1),
  });
  run(`INSERT OR IGNORE INTO InvoiceLine (id,invoiceId,productId,description,qty,unitPriceCents,discountPercent,grossCents,discountCents,netCents,createdAt)
       VALUES (:id,:invoiceId,:productId,:description,:qty,:unitPrice,0,:gross,0,:net,:createdAt)`, {
    id: id('invoice-line', n), invoiceId: id('invoice', n), productId: q.p.id, description: q.p.name, qty: q.qty, unitPrice: q.p.listPriceCents, gross: q.net, net: q.net, createdAt: iso(6 - n),
  });
}

for (let n = 1; n <= 5; n++) {
  const q = quotes[n - 1];
  const status = ['OPEN', 'OPEN', 'ACCEPTED', 'REJECTED', 'OPEN'][n - 1];
  run(`INSERT OR IGNORE INTO NegotiationRequest (id,quoteId,customerId,status,message,createdBy,createdAt,resolvedAt)
       VALUES (:id,:quoteId,:customerId,:status,:message,:createdBy,:createdAt,:resolvedAt)`, {
    id: id('negotiation', n), quoteId: q.id, customerId: q.customerId, status, message: 'Request to review commercial terms and delivery timing.', createdBy: alex.id, createdAt: iso(5 - n), resolvedAt: status === 'OPEN' ? null : iso(2),
  });
  run(`INSERT OR IGNORE INTO NegotiationChange (id,negotiationId,quoteLineId,field,oldValue,newValue,newRiskScore,newRiskBand,invalidatesApproval,createdAt)
       VALUES (:id,:negotiationId,:quoteLineId,'discountPercent',:oldValue,:newValue,:score,:band,:invalidates,:createdAt)`, {
    id: id('negotiation-change', n), negotiationId: id('negotiation', n), quoteLineId: id('line', n), oldValue: String(n * 2), newValue: String(n * 2 + 1), score: 25 + n * 7, band: n > 3 ? 'REVIEW' : 'LOW', invalidates: n === 2 ? 1 : 0, createdAt: iso(4 - n),
  });
  run(`INSERT OR IGNORE INTO NegotiationComment (id,negotiationId,authorId,authorName,authorRole,body,internal,createdAt)
       VALUES (:id,:negotiationId,:authorId,:authorName,:authorRole,:body,0,:createdAt)`, {
    id: id('negotiation-comment', n), negotiationId: id('negotiation', n), authorId: manager.id, authorName: manager.name, authorRole: manager.role, body: 'Reviewed and logged for the deal team.', createdAt: iso(3 - n),
  });
}

const auditRows = [
  ['CUSTOMER', 'demo-customer-04', 'CREATED', 'New customer onboarded'],
  ['PRODUCT', product('LAP-001').id, 'VIEWED', 'Product reviewed'],
  ['QUOTE', quotes[0].id, 'SUBMITTED', 'Quote submitted for approval'],
  ['APPROVAL', id('approval', 1), 'REQUESTED', 'Manager approval requested'],
  ['FULFILLMENT', id('fulfillment', 1), 'ALLOCATED', 'Warehouse allocation created'],
  ['INVOICE', id('invoice', 1), 'ISSUED', 'Invoice issued'],
  ['NEGOTIATION', id('negotiation', 1), 'OPENED', 'Negotiation opened'],
  ['QUOTE', quotes[3].id, 'CONFIRMED', 'Quote confirmed'],
  ['INVOICE', id('invoice', 2), 'PAYMENT_RECORDED', 'Payment recorded'],
  ['FULFILLMENT', id('fulfillment', 5), 'FULFILLED', 'Order fulfilled'],
];
for (let n = 0; n < auditRows.length; n++) {
  const [entityType, entityId, action, reason] = auditRows[n];
  run(`INSERT OR IGNORE INTO AuditEvent (id,actorId,actorRole,actorName,entityType,entityId,quoteId,action,newValue,reason,correlationId,createdAt)
       VALUES (:id,:actorId,:actorRole,:actorName,:entityType,:entityId,:quoteId,:action,:newValue,:reason,:correlationId,:createdAt)`, {
    id: id('audit', n + 1), actorId: n % 2 ? manager.id : alex.id, actorRole: n % 2 ? manager.role : alex.role, actorName: n % 2 ? manager.name : alex.name,
    entityType, entityId, quoteId: entityType === 'QUOTE' ? entityId : null, action, newValue: 'demo', reason, correlationId: `demo-correlation-${n + 1}`, createdAt: iso(5 - (n % 5)),
  });
}

for (const table of ['Customer', 'Product', 'ApprovalRequest', 'FulfillmentOrder', 'Invoice', 'NegotiationRequest', 'AuditEvent']) {
  console.log(`${table}: ${one(`SELECT COUNT(*) AS count FROM ${table}`).count}`);
}
db.close();
