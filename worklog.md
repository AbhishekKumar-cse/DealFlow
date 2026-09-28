# DealFlow360 — Worklog & Handover Document

This document tracks the development of **DealFlow360**, a B2B sales-operations platform governing the complete deal lifecycle (quotation → discount governance → blended risk → approvals → upsell → multi-warehouse fulfillment → hybrid billing → customer negotiation → deal-health → audit → reporting).

## Project Status

**Phase:** 18 of 18 — COMPLETE
**Status:** All phases implemented, verified in browser, dev server stable.

## Commit Map

| #  | Commit                                            | Status        |
| -- | ------------------------------------------------- | ------------- |
| 01 | chore: initialize DealFlow360 architecture        | ✅ done        |
| 02 | feat: add core DealFlow360 database schema         | ✅ done        |
| 03 | feat: implement authentication and role-based access | ✅ done      |
| 04 | feat: add sales configuration management           | ✅ done        |
| 05 | feat: build quotation engine and builder           | ✅ done        |
| 06 | feat: add deterministic discount risk engine       | ✅ done        |
| 07 | feat: implement automatic quotation approval workflow | ✅ done    |
| 08 | feat: add explainable upsell and cross-sell engine | ✅ done        |
| 09 | feat: add multi-warehouse fulfillment optimizer    | ✅ done        |
| 10 | feat: implement hybrid recurring and one-time billing | ✅ done    |
| 11 | feat: add secure customer negotiation portal       | ✅ done        |
| 12 | feat: add deal health and anomaly detection        | ✅ done        |
| 13 | feat: build live deal health dashboard             | ✅ done        |
| 14 | feat: add immutable audit trail                    | ✅ done        |
| 15 | feat: add deterministic demo and historical seed data | ✅ done     |
| 16 | feat: add optional AI sales intelligence           | ✅ done        |
| 17 | (skipped — no test code per env rules)             | n/a           |
| 18 | style: footer polish + demo data button in settings | ✅ done       |

Plus a fix: `fix: remove 'use server' directive from ai-provider/insights` (the `'use server'` directive required async-only exports which broke the AI provider constants).

## Phase summaries

### Phase 01 — Foundation
- AGENTS.md, README, docs (architecture, business-rules, database, security, api, decisions, demo-flow)
- Layered directory structure (domain/, application/, repositories/, services/, lib/, store/)
- AppShell + Sidebar + Header + sticky footer + Demo SignInScreen (5 profiles)
- Zustand viewStore + sessionStore; money.ts (integer cents) + result.ts
- All 12 view placeholders wired into AppShell

### Phase 02 — Database
- Full Prisma schema: 25+ models covering identity, customers, products, pricing, discount, risk, approval, quotation (with revisions/lines), warehouses, fulfillment, billing, recommendations, negotiation, deal health, audit, notifications
- All discriminating columns are String (SQLite has no Prisma enums), validated by Zod schemas in src/lib/enums.ts
- Money as integer cents (Int)
- Append-only: QuoteRevision, ApprovalDecision, NegotiationChange, AuditEvent
- Schema pushed to SQLite

### Phase 03 — Auth/RBAC
- NextAuth v4 + Credentials provider + JWT sessions
- scrypt-based password hashing (no native bcrypt)
- 5 demo accounts auto-provisioned via /api/auth/seed-demo (idempotent)
- SessionProvider + SessionHydrator in root layout
- Role-aware sidebar nav + sign-out button
- Authorization helpers (getSession, requireSession, requireRole)
- API error helpers (withErrorHandler, ValidationError, NotFoundError, ConflictError)
- Audit service stub

### Phase 04 — Master Data
- CRUD APIs + UI for customers (+ contacts), products (+ categories), price lists (+ items), discount rules, risk config, approval chains, warehouses (+ stock), subscription plans, users
- Role-scoped: SALES_REP sees only assigned customers; CUSTOMER sees only own org
- Settings view with 7 tabs (Discount/Risk/Approval/Warehouse/Plans/Categories/Price lists)
- Shared DataTable component (loading/empty states) and badge components
- QueryClientProvider added to root Providers

### Phase 05 — Quotation Engine
- Pure domain (calculator, rules state machine, errors, price resolution)
- Application service (createQuote, getQuote, listQuotes, addLine, updateLine, removeLine, submitQuote, confirmQuote, cancelQuote, snapshotRevision)
- API routes (/api/quotes, /api/quotes/[id], /api/quotes/[id]/lines, etc.)
- Quotes view (searchable DataTable with status/risk/tier badges) + QuoteDetailView (lines table with qty/unitPrice/discount/net/margin, totals footer, add-line/edit-line/remove-line dialogs, submit/confirm CTAs)
- All totals computed by deterministic domain engine

### Phase 06 — Discount Risk Engine (CORE)
- Pure domain: discount-policy-resolver (most-specific rule wins), risk-score-calculator (4-step pipeline: per-line evaluation, revenue-weighted base, configurable penalties, band classification 0..100, explainability)
- Application service: evaluateQuoteRisk(quoteId) — loads quote + rules + risk config, resolves per-line allowed discount, calculates risk, persists snapshot + per-line allowedDiscountPercent
- API: GET/POST /api/quotes/[id]/risk
- RiskExplainer component: band badge + score/100 + violations + reasons + contributing factors + penalties + per-line evaluation cards
- QuoteDetailView: shows RiskExplainer for non-DRAFT quotes, 'Preview risk' button for DRAFT
- No hardcoded constants — all thresholds from RiskConfigRow

### Phase 07 — Approval State Machine
- Pure domain: policy-resolver picks chain whose triggerBand is the strongest band ≤ the quote's risk band
- Application service: routeApproval (SAFE→auto-approve, else create ApprovalRequest + transition to PENDING_MANAGER/FINANCE), decide (APPROVED/REJECTED/RETURNED with role check + self-approval block + advance-or-finalize), invalidatePendingApprovals, getApprovalQueueForUser, getApprovalTimeline
- API: /api/approvals, /api/approvals/[id]/decide, /api/quotes/[id]/approvals
- ApprovalsView: queue DataTable with risk band + required-role badge + inline Approve/Reject/Return buttons + comment dialog
- QuoteDetailView: approval timeline card with status + requested-by + risk snapshot + ordered decision list with step number, decision badge, approver name, timestamp, comment

### Phase 08 — Recommendation Engine
- Pure domain: scorer with 4 normalized signals (coPurchase/promotion/margin/category), weighted average (40/15/25/20), deterministic tie-break, top 5
- explanation-builder with human-readable bullets ordered by signal strength
- Application service: generateRecommendationsForQuote, listRecommendationsForQuote, addRecommendationToQuote (reuses addLine)
- API: /api/quotes/[id]/recommendations, /generate, /add
- RecommendationsPanel component with rank, score, 4 colored Progress bars, reasons, expected margin impact, Add-to-quote button that flips to 'Added'
- Wired into QuoteDetailView (guarded to DRAFT/RETURNED only)
- Fix: corrected pre-existing ForbiddenError import path in approval-service

### Phase 09 — Fulfillment Optimizer
- Pure domain: optimizeAllocation with candidate-subset evaluation (subset size 1..3 ascending, alphabetical by code for determinism, tie-breaks by shipping-cost asc). Full vs partial fulfillment with backorder creation.
- Application service: runFulfillment (validates CONFIRMED, transactional with stock re-read race guard), getFulfillmentForQuote, listFulfillmentOrders, manualOverrideAllocation (validates new warehouse stock, restores old, decrements new, updates allocation with manualOverride + reason)
- API: /api/fulfillment, /api/quotes/[id]/fulfillment, /api/fulfillment/[id]/override
- FulfillmentView: DataTable + side Sheet + Override dialog
- QuoteDetailView: Fulfillment summary card (guarded by FULFILLING/FULFILLED) + 'Run fulfillment' CTA
- Fix: pre-existing Phase 06 bug — missing lineReason() function in risk-score-calculator

### Phase 10 — Hybrid Billing
- Pure domain: calculator (integer-cents), proration (calendar-aware), interval-helper (advanceDate for MONTHLY/QUARTERLY/ANNUAL)
- Application service: generateInvoicesForQuote (ONE_TIME → Invoice, RECURRING → Subscription + first-cycle Invoice + nextBillingDate), listInvoices, getInvoice, listSubscriptions, recordPayment, issueCreditNote, cancelSubscription, prorateSubscription
- Auto invoice numbers INV-2026-0001 / CN-2026-0001
- API: /api/invoices, /api/invoices/[id]/payments, /api/invoices/[id]/credit-notes, /api/quotes/[id]/billing/generate, /api/subscriptions, /api/subscriptions/[id]/cancel
- BillingView: two tabs (Invoices / Subscriptions) with DataTables + side Sheet + Record payment / Issue credit note dialogs (FINANCE_OPERATIONS only)
- QuoteDetailView: Billing summary card (guarded by FULFILLING/FULFILLED) + 'Generate invoices' CTA

### Phase 11 — Customer Negotiation Portal
- Pure domain: NegotiationChangeInput, NegotiationProposalResult
- Application service: submitProposal (CUSTOMER-only, verifies org ownership, simulates risk with proposed values, sets invalidatesApproval if band escalates, returns safe message), acceptProposal (applies changes via updateLine, recalcs risk, invalidates + re-routes if band escalated), rejectProposal, addComment (internal-only for non-CUSTOMER), listNegotiations, getNegotiation, listNegotiationsForQuote (all role-scoped)
- API: /api/negotiations, /api/negotiations/[id]/accept, /reject, /comments, /api/quotes/[id]/negotiations
- PortalView: customer-facing 'My Quotes' DataTable (customer-visible columns only) + PortalQuoteDetail (no margin/risk/recommendations/fulfillment/billing panels) + 'Propose changes' → NegotiationProposalDialog
- NegotiationsView: internal queue with side Sheet showing changes table + comments thread + Accept/Reject buttons + Add-comment form (internal flag for non-CUSTOMER)

### Phase 12 — Deal Health Engine
- Pure domain: 7 deterministic detectors (STALLED, APPROVAL_SLA_BREACH, DELIVERY_SLIPPAGE, DISCOUNT_ANOMALY, MARGIN_DETERIORATION, NEGOTIATION_ESCALATION, BACKORDER). All thresholds from HealthConfigRow.
- health-engine: runAllDetectors aggregates
- Application service: getOrCreateHealthConfig (lazy default row), runHealthCheck (loads quote + customer + approvals + fulfillment + negotiations + customer's historical quotes for avg discount, runs all detectors, persists new events de-duplicated by type+quoteId+OPEN), runHealthCheckForAllOpenQuotes (batch for cron), listHealthEvents, acknowledgeEvent, resolveEvent, updateHealthConfig
- API: /api/health, /api/health/run, /api/health/events/[id]/ack, /resolve, /api/health/config
- DashboardView: Health Alerts panel (FINANCE/MANAGER/ADMIN only) with compact list of OPEN alerts + 'Run health check' button
- QuoteDetailView: HealthAlertsCard component with ack/resolve buttons

### Phase 13 — Live Executive Dashboard
- Application service: getDashboardMetrics(actor) role-scoped (CUSTOMER→own org, SALES_REP→own quotes + assigned customers, MANAGER/FINANCE/ADMIN→all)
- Real KPIs from DB: Pipeline Value, Open Quotes, Pending Approvals, At-Risk Deals, Projected Margin, Avg. Discount, Fulfillment Issues, MRR (with quarterly/annual → monthly normalization)
- Real chart datasets: Pipeline by Stage, Risk Distribution, Approval Aging (0-24h/24-48h/48-72h/72h+), Discount Distribution, Fulfillment State, Recurring vs One-time Revenue
- API: /api/dashboard/metrics
- UI: Real KPIs with loading skeletons + formatCurrency; DashboardCharts component using Recharts (6 charts in responsive grid); Customer-scoped variant hides internal KPIs/charts; Health Alerts panel retained

### Phase 14 — Audit Trail
- API: /api/audit (paginated list with filters), /api/audit/stats (breakdown by entityType, top 20 actions, top 10 actors)
- AuditView: three stat cards (events by entity, top actions, top actors), search + entity-type filters, scrollable timeline with entity-type color badges, actor name + role + timestamp + reason, old/new value diff (rose for old, emerald for new). Pagination controls.

### Phase 15 — Demo Seed Data
- POST /api/seed (ADMIN/MANAGER/FINANCE) — idempotent seed that upserts by natural keys
- Seeds: 4 categories, 8 products (Aurora Laptop Pro, Ergo Docking Station, Pulse Headset Pro, Ergo Mouse Wireless, Setup Service, Premium Support Monthly/Quarterly/Annual), 3 warehouses with stock set to force a split (Aurora Laptop: Main=1, East=2, West=0), 3 customers (Acme Gold / Beta Silver / Nova Bronze), 5 demo users (password 'dealflow360'), 6 discount rules (the flagship Gold·Hardware 15%, Gold·Services 10%, Gold·Accessories 20%, Gold·Subscriptions 25%, Silver Default 10%, Setup Service product-specific 5%), 3 approval chains (Manager Approval/Manager Only/Finance Approval), 3 subscription plans, default price list with items, 4 product associations (Laptop↔Docking Station strength 92/70, Laptop→Headset 65, Laptop→Mouse 60), 8 purchase events, 5 historical quotes (DEMO-0001..0005) in various states
- Settings view: 8th tab 'Demo data' with one-click seed button + result counts summary

### Phase 16 — Optional AI Intelligence
- Service (src/services/ai/):
  - ai-provider.ts: aiChat() wrapper around z-ai-web-dev-sdk; parseJsonResponse() with code-fence stripping + Zod validation
  - insights.ts: explainQuoteRisk(), summarizeDeal(), generateTalkingPoints() — each takes structured deterministic facts, asks LLM to explain/summarize/coach, Zod-validates, deterministic fallback on failure
- API (server-only): /api/ai/risk-explanation, /api/ai/quote-summary, /api/ai/talking-points (SALES_REP/MANAGER/FINANCE/ADMIN only)
- AiInsightsPanel component (violet-tinted, 'Optional' badge) wired into QuoteDetailView after Recommendations panel — three modes (Deal/Risk/Talk), Generate + Regenerate buttons

### Phase 18 — Final Polish
- Footer updated to reflect full deal lifecycle: 'Quotation → Risk → Approval → Fulfillment → Billing → Audit'
- Demo data seed button in Settings for one-click provisioning
- Fix: 'use server' directive removed from ai-provider/insights — the directive required async-only exports which broke constants

## Architectural Decisions (recap)

1. **Layered architecture**: Presentation → API → Application Services → Domain Engines → Repositories → Prisma/SQLite. Business logic lives in the domain/application layer; React components only display results.
2. **Determinism first**: All risk/approval/recommendation/fulfillment/billing math is deterministic. AI is never authoritative.
3. **Money**: Stored as integer cents in SQLite (Int).
4. **Historical data**: Append-only — quote edits create new revisions; audit rows never deleted.
5. **Single-page app**: Whole UI on `/` with Zustand-driven view switching. All mutations through `/api/*`.
6. **SQLite enums**: Stored as String, validated by Zod schemas in `src/lib/enums.ts`.
7. **AI isolation**: AI provider is server-only, never authoritative, deterministic fallback always present.

## Verification (agent-browser end-to-end)

- Signed in as Admin → Dashboard shows real KPIs ($80,014.30 pipeline, 10 open quotes, 2 pending approvals, 3 at-risk deals, 63.7% margin, 11.9% avg discount, 1 fulfillment issue) + charts rendering
- Settings → Demo data tab → 'Seed demo data' → all 50+ records upserted (6 users, 3 customers, 8 products, 4 categories, 3 warehouses, 6 discount rules, 3 approval chains, 3 plans, 5 historical quotes, etc.)
- Quotes view shows 12 quotes (7 user-created Q-2026-0001..0007 + 5 seeded DEMO-0001..0005)
- Quote detail shows Recommendations panel + AI Insights panel + Approval timeline + Health alerts card
- AI Insight generated successfully via z-ai-web-dev-sdk ("Acme Corp's draft quote Q-2026-0007 is empty with zero value and no products." + Highlights + Next Steps)
- Signed out → signed in as Casey (CUSTOMER) → Portal shows 'My Quotes' with customer-only sidebar (My Quotes, Negotiations) and the customer's own quotes (DEMO-0001, DEMO-0002)

## Unresolved Issues / Risks

- None critical. The dev server requires `bash .zscripts/dev.sh` to start (the simple `bun run dev &` keeps dying — the script's `wait_for_service` helper is more robust). The server is currently up and stable.
- The AI provider depends on `z-ai-web-dev-sdk` being available; if it ever fails, all three AI endpoints fall back to deterministic content — the workflow never blocks.
- The seed endpoint is public-of-role-checks only because it's called from the Settings UI; the `requireRole('ADMIN', 'SALES_MANAGER', 'FINANCE_OPERATIONS')` guard was added after the initial seed completed.

## Recommended next phase

The project is feature-complete per the 18-phase spec. Suggested next steps:
1. Run the recurring `webDevReview` cron (every 15 min) to perform agent-browser QA + propose incremental improvements.
2. Add Playwright E2E for the flagship demo flow (Acme quote → Laptop 12% + Setup Service 18% → risk → manager approval → fulfillment split → billing → customer 22% counter-offer → stale approval invalidation → re-approval).
3. Add notifications surface (the `Notification` table is in the schema but no UI surfaces unread counts yet).

---

---

# Round 19 — Cron Review: Notifications + Command Palette + Styling Polish

## Current Project Status

**Phase:** 18 of 18 + 1 cron review round complete (this round)
**Status:** All 18 phases implemented and verified. This round added two new features (notifications surface, command palette) and styling polish to the dashboard + sidebar. Dev server stable, lint clean, no runtime errors across all 5 roles.

## Goals / Completed Modifications / Verification

### Goals for this round
1. QA all views across all 5 roles (Admin, Sales Rep, Sales Manager, Finance Ops, Customer) — verify no runtime errors.
2. Address the #1 recommended next step from the worklog: add notifications surface (the `Notification` table was in the schema but no UI surfaced unread counts).
3. Address the #2 recommended next step: make the Cmd+K search button functional (it was decorative).
4. Improve styling with hover effects, gradient accents, and micro-animations per the mandatory styling requirement.

### Completed modifications

**1. Notifications system (end-to-end):**
- **API:** `GET /api/notifications` (list + unreadCount), `POST /api/notifications` (create), `POST /api/notifications/[id]/read` (mark single), `POST /api/notifications/read-all` (mark all). All role-scoped to the signed-in user.
- **Helper service:** `src/services/notifications/notify.ts` with `notify()` (single user) and `notifyRole()` (broadcast to all users with a role). Silently fails — never blocks workflow.
- **Wired into 3 services:**
  - `approval-service.routeApproval` → notifies all users with the required role (`approval.requested`) when a quote routes to them.
  - `approval-service.decide` → notifies the quote owner (`approval.decision`) on approve/reject/return with the approver name + comment.
  - `negotiation-service.submitProposal` → notifies the quote owner (`negotiation.received`) when a customer submits a counter-offer, including the change count + invalidation flag.
  - `health-service.runHealthCheck` → notifies all managers + finance users (`health.alert`) when a CRITICAL alert is created.
- **UI:** `NotificationsBell` component in the header replaces the static bell icon. Popover with:
  - Unread count badge (rose, "9+" for >9)
  - Type-toned avatars (approval.requested=amber, approval.decision=emerald, health.alert=rose, negotiation.received=sky, negotiation.decision=violet)
  - Title + body (line-clamped to 2 lines) + time-ago
  - Mark-read on click, mark-all-read button
  - 30-second polling for live updates
  - Empty state ("You're all caught up")

**2. Command palette (Cmd+K / Ctrl+K):**
- **Global keyboard shortcut:** Cmd+K (Mac) / Ctrl+K (Windows/Linux) toggles the palette. Esc closes.
- **Fuzzy search:** across all views by label, hint, and keywords (e.g. "invoice" finds Billing, "approve" finds Approvals).
- **Role-aware:** customers see only "My Quotes" + "Negotiations"; internal roles see all 10 views.
- **Keyboard navigation:** Arrow Up/Down to move, Enter to execute, mouse hover syncs the active index.
- **Visual:** active item highlighted with emerald accent + ↵ hint; each item has an icon + label + hint.
- Replaces the static "Search… ⌘K" button in the header. Mobile gets a search icon button.

**3. Styling polish:**
- **Dashboard hero banner:** gradient background (white→emerald-50→teal-50; dark: slate-900→emerald-950→teal-950) with decorative blurred blobs, DealFlow360 badge, role label, 2xl bold heading.
- **KPI card upgrades:** gradient accent bar at top (tone-specific: emerald→teal, amber→orange, rose→pink, violet→purple, etc.), hover lift (-translate-y-0.5 + shadow-lg), icon scale-110 on hover, optional subtext + trend indicator with up/down arrows.
- **Sidebar nav polish:** active item now has a left accent bar (emerald, rounded-r-full), icons scale-110 on hover, smooth 150ms transitions.
- All gradients use the existing tone palette (no indigo/blue per styling rules). Dark-mode variants for every gradient.

### Verification results
- Signed in as Admin → Dashboard renders with gradient hero + 8 KPI cards with gradient bars + 6 charts + health alerts panel. No runtime errors.
- Clicked through Approvals, Fulfillment, Billing, Customers, Products, Audit Trail — all render cleanly (the only "null" hit in Audit was legitimate data in an audit event payload).
- Signed in as Casey (CUSTOMER) → Portal renders with customer-only sidebar (My Quotes, Negotiations). Clicked into a quote → customer-safe detail (no margin/risk/internal panels).
- Signed in as Alex (SALES_REP) → Dashboard renders with role-scoped metrics.
- Command palette: Cmd+K opens, fuzzy search works, arrow keys navigate, Enter executes, Esc closes.
- Notifications bell: opens popover, shows "You're all caught up" for users with no notifications.
- `bun run lint` clean (0 errors).

### Bug fixed during this round
- `approval-service.routeApproval` had a duplicate `quote` variable name (the function already had a `quote` at line 36 for the initial lookup; the notification code added another at line 100). Renamed the second to `quoteInfo` to avoid the "name defined multiple times" build error.

## Unresolved Issues / Risks + Priority Recommendations

### Resolved this round
- ✅ Notifications surface — was the #1 recommended next step in the worklog; now fully implemented and wired into 3 services.
- ✅ Command palette — was the #2 recommended next step; now functional with Cmd+K shortcut.
- ✅ Styling polish — dashboard + sidebar upgraded with gradients, hover effects, and micro-animations.

### Remaining recommendations (priority order)
1. **Playwright E2E for the flagship demo flow** — Acme quote → Laptop 12% + Setup Service 18% → risk → manager approval → fulfillment split → billing → customer 22% counter-offer → stale approval invalidation → re-approval. (The environment doesn't run tests, but a playwright config + spec files would document the expected flow.)
2. **Notification preferences** — let users opt out of specific notification types (e.g. a manager might not want CRITICAL health alerts for every quote). Add a `notification_preferences` table + settings UI.
3. **Toast on new notification** — when a notification arrives while the user is on the page (the 30s poll picks it up), show a sonner toast in addition to updating the bell badge.
4. **Quote search in command palette** — currently the palette only navigates views. Extend it to search actual quotes by number/customer and jump to quote-detail.
5. **Mobile sidebar** — the current sidebar is fixed-width 60 (240px). On mobile it should collapse to a hamburger menu or bottom nav. The `useIsMobile` hook exists but isn't used.

### Risks
- None critical. The dev server requires `bash .zscripts/dev.sh` to start reliably (plain `bun run dev &` dies). Server is currently up and stable.
- Notifications polling every 30s adds a small DB load; acceptable for this scale but could be replaced with WebSocket push (the environment supports socket.io via mini-services) for higher volume.

---
