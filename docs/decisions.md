# ADR — Architecture Decision Records

## ADR-001: Adapt Supabase/PostgreSQL stack to Next.js + Prisma + SQLite

**Context.** The original spec assumes Supabase + PostgreSQL + RLS. The deployment environment is Next.js 16 with Prisma + SQLite and no external Postgres.

**Decision.** Keep the layered architecture identical, but implement tenant isolation and authorization at the **application service layer** instead of PostgreSQL RLS. SQLite has no RLS equivalent, so the service layer is the enforcement point.

**Consequences.** Authorization logic must be carefully unit-verified per service. We add a single `authorize(role, action, resource)` helper used by every API route.

## ADR-002: Replace OpenRouter with z-ai-web-dev-sdk

**Context.** The spec calls for OpenRouter as the optional AI provider. The environment ships `z-ai-web-dev-sdk`.

**Decision.** Use `z-ai-web-dev-sdk`'s chat completions API behind an `AiProvider` interface. The interface is identical in spirit: structured facts in → validated text/JSON out. AI is never authoritative.

**Consequences.** AI features degrade gracefully if the SDK is unavailable. Deterministic engines remain the source of truth.

## ADR-003: Single-page app on `/`

**Context.** The environment only exposes `/` to the user. The spec wants dashboard, quotes, approvals, fulfillment, billing, customers, products, settings and portal.

**Decision.** Build one `/` route with a sidebar-driven view switcher using a Zustand store. All mutations go through `/api/*` routes.

**Consequences.** No Next.js route segments for feature pages. Deep-linking is handled via `?view=quotes` query param (read on mount). The browser back button is respected for view changes.

## ADR-004: Money as integer cents

**Context.** Floating-point arithmetic is unsafe for money. SQLite `REAL` would re-introduce the problem.

**Decision.** All monetary columns are Prisma `Int` representing cents. Conversion to decimal happens only at the presentation boundary via `src/lib/money.ts`.

**Consequences.** Calculators use integer math; rounding is explicit at line totals. Percentages are stored as integer percent (0..100) — sufficient precision for this domain.

## ADR-005: Append-only history

**Context.** Quotes/approvals/negotiations must remain traceable across revisions.

**Decision.** Quote edits create a new `QuoteRevision` row referencing the previous revision. Approval requests reference a specific revision. Negotiation changes are rows in `negotiation_changes`. Audit rows are never updated or deleted.

**Consequences.** The "current" quote is the latest revision; historical revisions are read-only.
