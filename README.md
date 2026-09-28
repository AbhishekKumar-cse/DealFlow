<div align="center">

# DealFlow360

### The Deal Lifecycle Operating System

**Govern the complete B2B deal lifecycle — quotation, blended risk, approval orchestration, multi-warehouse fulfillment, hybrid billing, customer negotiation, and audit — in one deterministic, explainable platform.**

Built with Next.js 16 · TypeScript 5 · Prisma · SQLite · shadcn/ui · Tailwind CSS 4 · Recharts · z-ai-web-dev-sdk

</div>

---

## Why DealFlow360

Most "deal" tools stop at quote generation. DealFlow360 treats the **entire deal** as a first-class state machine. The core innovation is the **deterministic blended risk engine**: discounts are governed by customer-tier + product-category rules, and an explainable 0–100 risk score routes every quote through the correct approval chain. The customer can negotiate; if their counter-offer breaches a ceiling, the prior approval is **automatically invalidated** and re-routed.

### The deal lifecycle

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          THE DEAL LIFECYCLE                              │
└──────────────────────────────────────────────────────────────────────────┘

  CREATE QUOTE  →  CALCULATE TOTALS  →  RESOLVE DISCOUNT CEILING
        ↓                                          ↓
        ↓             Per-line overage vs. tier/category rule
        ↓                                          ↓
        ↓             Revenue-weighted blended score 0–100
        ↓                                          ↓
        ↓                  CLASSIFY BAND
        ↓                                          ↓
        ↓           ┌──────────┬─────────┬────────┬────────┐
        ↓           │  SAFE    │ REVIEW  │MANAGER │FINANCE  │
        ↓           │ auto-OK  │ manager │manager │ mgr+fin │
        ↓           └──────────┴─────────┴────────┴────────┘
        ↓                                          ↓
  SUBMIT QUOTE  →  ROUTE APPROVAL  →  APPROVAL STATE MACHINE
        ↓                                          ↓
        ↓                  ┌── APPROVED ──┐
        ↓                  ↓              ↑
        ↓              REJECTED        RETURNED
        ↓                  ↓              ↓
        ↓              (closed)       (back to DRAFT)
        ↓                                          ↓
  CONFIRM  →  WAREHOUSE OPTIMIZER  →  FULFILLMENT
        ↓                                          ↓
        ↓      minimize # warehouses used           ↓
        ↓      minimize shipping cost              ↓
        ↓      maximize fulfilled qty              ↓
        ↓      → split or backorder as needed       ↓
        ↓                                          ↓
  HYBRID BILLING  →  ONE-TIME INVOICE  +  RECURRING SUBSCRIPTION
        ↓                                          ↓
        ↓      proration · credit notes · payments ↓
        ↓                                          ↓
  CUSTOMER NEGOTIATION  →  COUNTER-OFFER
        ↓                                          ↓
        ↓      IF discount > ceiling →            ↓
        ↓      recalc risk → invalidate approval  ↓
        ↓      → re-route to approver             ↓
        ↓                                          ↓
  RE-APPROVE  ←  STALE APPROVAL INVALIDATED
        ↓
  DEAL HEALTH  →  7 deterministic anomaly detectors
        ↓
  AUDIT TRAIL  →  immutable, append-only event log

  ┌──────────────────────────────────────────────────────────────────────┐
  │  OPTIONAL AI LAYER (non-authoritative) — explain risk, summarize    │
  │  deal, generate sales talking points. Falls back to deterministic    │
  │  content if the AI provider is unavailable.                         │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                           │
│  Next.js App Router · React · shadcn/ui · Tailwind 4 · Recharts         │
│  Single `/` route with Zustand-driven view switching                    │
│  ── Dashboard · Quotes · Quote Detail · Approvals · Fulfillment ·       │
│     Billing · Customers · Products · Negotiations · Portal ·            │
│     Audit Trail · Settings                                              │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  API LAYER  (Next.js Route Handlers under /api/*)                       │
│  Zod request validation · session/role authorization · audit emission  │
│  ── /api/quotes · /api/approvals · /api/fulfillment · /api/invoices ·   │
│     /api/subscriptions · /api/negotiations · /api/health · /api/audit · │
│     /api/notifications · /api/dashboard/metrics · /api/ai/*              │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  APPLICATION SERVICES                                                   │
│  QuotationService · ApprovalService · FulfillmentService ·              │
│  BillingService · NegotiationService · RecommendationService ·         │
│  RiskService · HealthService · AuditService · NotificationService ·     │
│  DashboardService · AiInsightService                                    │
│  ── Orchestrates domain engines + repositories, transactional, audited  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  DOMAIN ENGINES  (pure, deterministic, testable)                        │
│  ┌──────────────┬───────────────┬──────────────┬──────────────┐         │
│  │ Quotation    │ Risk          │ Approval     │ Fulfillment  │         │
│  │ Calculator   │ Score         │ Policy       │ Optimizer    │         │
│  │ State Machine│ Calculator   │ Resolver     │ (subset eval)│         │
│  ├──────────────┼───────────────┼──────────────┼──────────────┤         │
│  │ Recommendation│ Billing      │ Negotiation  │ Deal Health  │         │
│  │ Scorer       │ Calculator   │ (simulate    │ Detectors    │         │
│  │ Explainer    │ Proration    │  + invalidate)│ (7 detectors)│        │
│  └──────────────┴───────────────┴──────────────┴──────────────┘         │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  REPOSITORY  (Prisma Client) · SQLite (file: ./db/custom.db)            │
│  25+ models · integer-cents money · append-only history                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Three rules the codebase never breaks:**
1. **UI is not business logic** — React may display results, never compute authoritative values.
2. **Database is source of truth** — no static business-data arrays in code.
3. **AI is not authoritative** — AI may summarize/explain; it never decides discounts, risk, approvals, allocations, invoice totals, or payment totals.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Full-stack React, Turbopack dev server |
| **Language** | TypeScript 5 (strict) | Type safety throughout |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Fast, consistent, accessible UI |
| **Forms** | React Hook Form + Zod | Shared validation client↔server |
| **Server state** | TanStack Query | Async data with caching + invalidation |
| **Client state** | Zustand | Single-page view switching + session mirror |
| **Charts** | Recharts | 6 live dashboard visualizations |
| **Auth** | NextAuth.js v4 | Credentials provider + JWT sessions |
| **DB** | Prisma + SQLite | 25+ models, integer-cents money, append-only history |
| **AI** | z-ai-web-dev-sdk | Optional, non-authoritative explainability |
| **Notifications** | Polling (15s) + Sonner toast | Real-time alerts with graceful fallback |

---

## Feature Catalog

### 1. Quotation Engine
- **Pure domain calculator** — integer-cents math for gross/discount/net/margin per line
- **State machine** — DRAFT → SUBMITTED → PENDING_MANAGER/PENDING_FINANCE → APPROVED → CONFIRMED → FULFILLING → FULFILLED (or REJECTED/RETURNED/CANCELLED)
- **Price list resolution** — price-list item wins over product list price
- **Append-only revisions** — every material change snapshots a `QuoteRevision` row
- **Role-scoped** — sales reps see only their own + assigned customers' quotes; customers see only their organization

### 2. Discount Governance & Blended Risk Engine (the core)
- **Rule precedence** (most specific wins): product+tier → category+tier → tier → category → global default
- **Per-line evaluation** — overage %, discount severity, revenue weight, margin factor
- **Blended 0–100 score** — revenue-weighted base + configurable penalties:
  - Multi-violation penalty
  - High-revenue concentration penalty
  - Low-margin penalty
  - Negotiation escalation penalty
  - Total-discount penalty
- **Band classification** — SAFE / REVIEW / MANAGER / FINANCE (all thresholds configurable)
- **Full explainability** — every score returns reasons, contributing factors, penalties, and per-line evaluation cards
- **No hardcoded constants** — every threshold comes from `RiskConfig`

### 3. Approval State Machine
- **Automatic routing** — SAFE auto-approves; REVIEW/MANAGER routes to manager; FINANCE routes to manager → finance (multi-step)
- **Self-approval blocked** — approver can never approve their own quote
- **Decision types** — APPROVED (advance or finalize), REJECTED, RETURNED
- **Stale-approval invalidation** — when a negotiation materially changes the quote, pending approvals are marked SUPERSEDED and re-routed
- **Full timeline** — every request + decision persisted with timestamp, approver, comment

### 4. Recommendation Engine (Upsell / Cross-Sell)
- **4 normalized signals** (0–100 each): co-purchase strength, promotion, margin, category fit
- **Weighted scoring** — defaults `{ co-purchase: 40, promotion: 15, margin: 25, category: 20 }`
- **Deterministic tie-break** — score desc, then name asc (no randomness)
- **Filters** — inactive products, already-on-quote products, below margin threshold
- **Explainable** — each recommendation returns reasons + expected margin impact

### 5. Multi-Warehouse Fulfillment Optimizer
- **Objective priority**: (1) minimize warehouses used, (2) minimize shipping cost, (3) maximize fulfilled qty
- **Candidate-subset evaluation** — enumerates all 1–3 warehouse combinations to guarantee the optimum (not naive greedy)
- **Split allocations** — when no single warehouse has enough stock
- **Backorders** — for shortfalls, with `resolvedAt` tracking
- **Manual overrides** — finance can move allocations with a required reason + audit event
- **Race-safe stock decrement** — re-reads stock inside the transaction

### 6. Hybrid Billing
- **One-time lines → Invoice** on confirmation
- **Recurring lines → Subscription + first-cycle Invoice + nextBillingDate** (auto-advanced)
- **Proration** — calendar-aware: `cyclePrice × remainingDays / cycleDays`
- **Payments** — record with method + reference; auto-transitions invoice to PAID/PARTIAL
- **Credit notes** — for refunds/adjustments with auto-numbering (CN-2026-0001)
- **Subscription cancellation** + **mid-cycle proration** (credit unused + charge new plan)
- **Auto invoice numbers** (INV-2026-0001)

### 7. Customer Negotiation Portal
- **Customer-safe views** — no margin, no risk details, no internal notes
- **Counter-offer submission** — propose qty/discount changes per line
- **Risk simulation** — server simulates the proposed changes; if the risk band escalates, sets `invalidatesApproval`
- **Safe customer messaging** — "Your proposed change requires additional approval." (never exposes internal formulas)
- **Accept flow** — applies changes via `updateLine`, recalculates risk, invalidates pending approvals if band escalated, re-routes

### 8. Deal Health Engine
Seven deterministic anomaly detectors (all thresholds configurable, no ML):

| Detector | Trigger |
|---|---|
| `STALLED` | Quote in `PENDING_*` longer than `stalledDaysThreshold` |
| `APPROVAL_SLA_BREACH` | ApprovalRequest PENDING longer than `approvalSlaHours` |
| `DELIVERY_SLIPPAGE` | Expected delivery date passed, quote not yet FULFILLED |
| `DISCOUNT_ANOMALY` | Current discount > customer's historical average + threshold |
| `MARGIN_DETERIORATION` | Quote margin below `marginDeteriorationThreshold` |
| `NEGOTIATION_ESCALATION` | ≥ N active negotiations on a single quote |
| `BACKORDER` | FulfillmentOrder has unresolved backorders |

Each alert returns: type, severity (INFO/WARN/CRITICAL), evidence, recommended action. Events are OPEN → ACK → RESOLVED.

### 9. Live Executive Dashboard

**8 real KPIs** (all computed from the database, role-scoped):

| KPI | Calculation |
|---|---|
| Pipeline Value | Σ `totalCents` for non-DRAFT/REJECTED/CANCELLED/FULFILLED |
| Open Quotes | Count of non-FULFILLED/CANCELLED/REJECTED |
| Pending Approvals | Count of PENDING ApprovalRequests |
| At-Risk Deals | Quotes with riskBand MANAGER/FINANCE or open health events |
| Projected Margin | Weighted margin % across pipeline quotes |
| Avg. Discount | Avg discount % across submitted quotes |
| Fulfillment Issues | FulfillmentOrders PARTIAL/BACKORDERED or with unresolved backorders |
| Recurring Revenue (MRR) | Σ ACTIVE subscriptions normalized to monthly (quarterly ÷ 3, annual ÷ 12) |

**6 live charts** (Recharts):

| Chart | Type | Data |
|---|---|---|
| Pipeline by Stage | Horizontal bar | Count by status bucket (Draft, Submitted/Pending, Approved, Confirmed/Fulfilling, Fulfilled) |
| Risk Distribution | Donut/pie | Count by riskBand (SAFE, REVIEW, MANAGER, FINANCE) |
| Approval Aging | Vertical bar | Count by age bucket (0–24h, 24–48h, 48–72h, 72h+) |
| Discount Distribution | Vertical bar | Count by avg discount bucket (0–5%, 5–10%, 10–15%, 15–20%, 20%+) |
| Fulfillment State | Horizontal bar | Count by FulfillmentOrder status |
| Recurring vs One-time | Pie | MRR vs issued one-time invoice total |

### 10. Immutable Audit Trail
- **Append-only** — no update/delete API for audit events
- **Captures**: actor id/role/name, entity type/id, action, old/new values, reason, correlation id, timestamp
- **24+ actions tracked**: `quote.create`, `quote.submit`, `approval.request`, `approval.approve`, `approval.reject`, `fulfillment.run`, `fulfillment.override`, `billing.invoice.create`, `billing.payment.record`, `negotiation.submit`, `negotiation.accept`, `health.ack`, `discountRule.update`, `riskConfig.update`, …
- **Stats endpoint** — breakdown by entity type, top actions, top actors

### 11. Notifications (real-time)
- **In-app bell** with unread count badge, type-toned avatars, time-ago, mark-read, mark-all-read
- **15-second polling** + **Sonner toast** on new notification arrival (with "View" action button)
- **Wired into 4 services**:
  - Approval routing → notifies all users with the required role
  - Approval decisions → notifies the quote owner
  - Negotiation submission → notifies the quote owner
  - CRITICAL health alert → notifies all managers + finance users

### 12. Command Palette (⌘K / Ctrl+K)
- Global keyboard shortcut
- Fuzzy search across all views by label, hint, and keywords
- Role-aware (customers see only their 2 views)
- Full keyboard navigation (↑↓ + Enter + Esc)

### 13. Optional AI Layer (non-authoritative)
Three AI features powered by `z-ai-web-dev-sdk`, each with a **deterministic fallback** if the provider is unavailable:

| Feature | Input | Output |
|---|---|---|
| `explainQuoteRisk` | Quote risk facts | Internal summary + customer-safe summary + recommendations |
| `summarizeDeal` | Quote facts | One-liner + highlights + next steps |
| `generateTalkingPoints` | Quote + customer facts | Opening + value propositions + closing |

All AI responses are **Zod-validated**. AI never calculates or overrides risk, discounts, approvals, allocations, invoice totals, or payment totals.

---

## Roles & Permissions

| Role | Sees | Can do |
|---|---|---|
| `SALES_REP` | Own quotes + assigned customers | Create/edit drafts, submit, view |
| `SALES_MANAGER` | All team quotes | Manager approvals, view all |
| `FINANCE_OPERATIONS` | All quotes | Finance approval, fulfillment ops, billing ops, warehouse override |
| `CUSTOMER` | Only own organization | View own quotes, submit counter-offers, view own negotiations |
| `ADMIN` | Everything | Configuration + administration |

**Self-approval is always blocked** regardless of role.

---

## Project Layout

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # 50+ route handlers
│   │   ├── quotes/             # CRUD + lines + submit/confirm + risk + recommendations + billing + fulfillment + approvals + negotiations
│   │   ├── approvals/          # Queue + decide
│   │   ├── fulfillment/        # List + override
│   │   ├── invoices/           # List + payments + credit notes
│   │   ├── subscriptions/      # List + cancel
│   │   ├── negotiations/       # List + accept/reject + comments
│   │   ├── health/             # Events + run + config
│   │   ├── audit/              # List + stats
│   │   ├── notifications/      # List + read + read-all
│   │   ├── dashboard/metrics/  # KPIs + chart datasets
│   │   ├── ai/                 # risk-explanation + quote-summary + talking-points
│   │   ├── seed/               # Deterministic demo seed + bulk random
│   │   └── auth/               # NextAuth + signup + seed-demo
│   └── page.tsx                # Single-page app shell
│
├── components/
│   ├── ui/                     # 40+ shadcn/ui primitives
│   └── dealflow/               # Feature components
│       ├── app-shell.tsx       # Sidebar + header + main + footer
│       ├── sidebar.tsx        # Role-aware nav with active accent bar
│       ├── header.tsx         # View title + command palette + bell
│       ├── notifications-bell.tsx
│       ├── command-palette.tsx
│       ├── data-table.tsx     # Shared table with loading/empty states
│       ├── badges.tsx         # Tier/Risk/QuoteStatus/Approval/Fulfillment/Severity
│       ├── risk-explainer.tsx
│       ├── recommendations-panel.tsx
│       ├── ai-insights-panel.tsx
│       ├── health-alerts-card.tsx
│       ├── dashboard-charts.tsx  # 6 Recharts visualizations
│       └── views/             # 12 view components
│
├── domain/                    # Pure business engines
│   ├── quotation/             # calculator, rules, errors, price-resolution
│   ├── risk/                  # discount-policy-resolver, risk-score-calculator
│   ├── approval/              # policy-resolver
│   ├── recommendation/        # scorer, explanation-builder
│   ├── fulfillment/           # optimizer (subset evaluation), errors
│   ├── billing/               # calculator, proration, interval-helper
│   ├── negotiation/           # types
│   ├── deal-health/           # 7 detectors
│   └── audit/                 # (via service)
│
├── application/               # Services orchestrating domain + repo
│   ├── quotation/             # Full quote CRUD + submit/confirm/cancel + revision snapshot
│   ├── risk/                  # evaluateQuoteRisk (persist snapshot)
│   ├── approval/              # routeApproval + decide + invalidatePending
│   ├── recommendation/        # generate + list + add
│   ├── fulfillment/           # run + override
│   ├── billing/               # generate invoices + payments + credit + prorate
│   ├── negotiation/           # submit + accept + reject + comments
│   ├── deal-health/           # runHealthCheck + ack + resolve
│   └── dashboard/             # getDashboardMetrics (role-scoped)
│
├── services/
│   ├── auth/                  # NextAuth config + scrypt password hashing
│   ├── ai/                    # ai-provider + insights
│   ├── audit/                 # Append-only audit writer
│   └── notifications/          # notify + notifyRole
│
├── lib/
│   ├── db.ts                  # Prisma client singleton
│   ├── money.ts               # Integer-cents helpers (formatCurrency, prorate, ...)
│   ├── result.ts              # Result<T, E> type
│   ├── enums.ts               # Zod schemas for all String-enum columns
│   ├── auth.ts                # getSession, requireSession, requireRole
│   ├── api-error.ts           # withErrorHandler + error classes
│   ├── pagination.ts          # Shared list pagination
│   └── schemas/               # Zod request schemas
│
└── store/
    ├── session-store.ts       # Zustand session mirror
    └── view-store.ts           # Zustand view navigation
```

---

## The Flagship Demo Flow

```
1. Sales Rep signs in → Dashboard shows ₹80k pipeline, 10 open quotes
2. Creates quote for Acme (Gold)
   - Laptop (Hardware) qty 3 discount 12%   → within 15% ceiling ✓
   - Setup Service (Services) qty 1 discount 18% → 8pp overage on 10% ceiling
3. Risk engine evaluates live → band = MANAGER, score ≈ 62
   Explainer: "Setup Service has an 18% discount against a configured
              10% ceiling, creating an 8 percentage-point overage."
4. Recommendation panel → "Add Ergo Docking Station" (co-purchase strength 92)
5. Submit → routed to MANAGER approval (per the risk band)
6. Manager signs in → Approvals queue → approves
7. Finance/Operations runs fulfillment optimizer
   - Main Warehouse has 1 laptop, East Depot has 2
   - System splits: Main(1) + East(2)
   - Explainer: "Selected 2 warehouses because no single warehouse can
                satisfy the requested quantity."
8. Billing
   - One-time invoice for Laptop + Setup Service
   - Recurring subscription for Premium Support (monthly)
9. Customer signs into Portal → sees own quote
   - Proposes laptop discount 12% → 22%
10. System recalculates risk → band escalates
    - Prior approval invalidated (SUPERSEDED)
    - Manager re-approval required
    - Customer sees: "Your proposed change requires additional approval."
11. Manager re-approves
12. Dashboard auto-refreshes → deal-health green, audit trail complete
```

**The "wow" moments**: risk explainability, warehouse split reasoning, automatic stale-approval invalidation.

---

## Development

```bash
bun run dev       # dev server on :3000
bun run lint      # eslint
bun run db:push   # apply schema to SQLite
```

### Demo accounts

All demo accounts use password `dealflow360`:

| Email | Role |
|---|---|
| `alex@dealflow360.io` | Sales Rep |
| `morgan@dealflow360.io` | Sales Manager |
| `finn@dealflow360.io` | Finance Operations |
| `casey@acme.io` | Customer (Acme Corp) |
| `admin@dealflow360.io` | Admin |

### One-click seed

After signing in as an admin/manager/finance user → **Settings → Demo data**:
1. **Seed demo data** (emerald button) — idempotent flagship demo: 4 categories, 8 products, 3 warehouses, 3 customers (Acme Gold / Beta Silver / Nova Bronze), 5 demo users, 6 discount rules (the flagship Gold·Hardware 15%, Gold·Services 10%), 3 approval chains, 3 subscription plans, product associations, purchase history, 5 historical quotes.
2. **Generate 200 random records** (violet button) — 20 customers + 100 quotes + 50 invoices + 30 subscriptions + approval requests + health events for dashboard volume testing.

---

## Documentation

See `docs/` for:
- `architecture.md` — layered architecture diagram + rules
- `business-rules.md` — discount governance, risk formula, approval workflow, fulfillment, billing, negotiation, health, audit
- `database.md` — entity map, relationships, money conventions, index strategy
- `security.md` — auth, RBAC, tenant isolation, self-approval block
- `api.md` — API surface
- `decisions.md` — ADRs (Supabase→Prisma, OpenRouter→z-ai-sdk, single-page app, integer cents, append-only)
- `demo-flow.md` — flagship user journey

`worklog.md` tracks the commit-by-commit build log + cron review rounds.

`AGENTS.md` is the engineering contract (architecture, rules, determinism, coding style).

---

## Determinism Contract

The following are **always deterministic** (identical inputs → identical outputs):

- Quote calculation
- Discount limit evaluation
- Risk score
- Approval routing
- Recommendation ranking
- Warehouse allocation
- Invoice calculation
- Proration
- Deal-health rules

**AI is never authoritative.** AI may summarize, explain, and generate optional natural-language insights. If AI fails, deterministic fallbacks are always shown — the workflow never blocks.

---

## Stats

- **25+** Prisma models
- **50+** API route handlers
- **10** pure domain engines
- **11** application services
- **12** view components
- **6** live Recharts visualizations
- **7** deal-health detectors
- **8** dashboard KPIs
- **24+** audited actions
- **5** roles with full RBAC
- **0** hardcoded business constants (all thresholds configurable)
- **0** indigo/blue colors (per styling rules)
- **100%** integer-cents money (no floating point in calculations)

<div align="center">

**[ Open the Preview Panel → Sign in as admin@dealflow360.io → Settings → Demo data → Seed demo data ]**

</div>
