# AGENTS.md — DealFlow360 Engineering Contract

You are the principal software architect and senior full-stack engineer responsible for building **DealFlow360**.

## PRODUCT

DealFlow360 is a B2B sales operations platform that governs the complete deal lifecycle:

```
Customer → Product Selection → Quotation → Discount Governance → Blended Risk Analysis
→ Approval Routing → Upsell/Cross-sell → Multi-Warehouse Fulfillment → Hybrid Billing
→ Customer Negotiation → Approval Re-evaluation → Deal Health → Audit → Reporting
```

## PRIMARY OBJECTIVE

Build a genuinely functional, database-backed business application. This is not a static prototype and not a UI-only demo.

## SOURCE OF TRUTH

The supplied DealFlow360 problem statement is the primary product specification.

When implementing a feature:
1. Follow the supplied specification first.
2. Clearly distinguish required functionality from engineering recommendations.
3. Do not invent features that alter the core business meaning.
4. When the specification does not define an exact formula or threshold, use a deterministic configurable implementation and document the engineering assumption.

## ARCHITECTURAL PRINCIPLES

```
Presentation → Application → Domain → Repository → Database
```

- Business logic belongs in the domain/application layer.
- React components must never contain authoritative business rules.
- The UI may display calculations but cannot define them independently.

## DATABASE

- Prisma + SQLite is the source of truth (adapted from PostgreSQL/Supabase for this environment).
- Use: PKs, FKs, unique constraints, indexes, timestamps, status fields, transactional operations.
- Money is stored as integer cents to avoid floating-point errors.
- Never use JavaScript floating point as the authoritative representation of monetary values.

## SECURITY

- NextAuth.js for authentication (adapted from Supabase Auth).
- Application-level role-based authorization (RBAC).
- Customer tenant/data isolation enforced at the service layer.
- Never rely solely on frontend route protection.

## ROLES

- `SALES_REP` — create quotations, edit authorized drafts, submit, view assigned customers. Cannot approve own quote.
- `SALES_MANAGER` — access team quotations, perform manager approvals.
- `FINANCE_OPERATIONS` — finance approval, fulfillment operations, billing operations.
- `CUSTOMER` — only own organization, only own quotes, only own negotiations.
- `ADMIN` — configuration and administration.

## DOMAIN MODULES

`quotation`, `discount`, `risk`, `approval`, `recommendation`, `fulfillment`, `billing`, `negotiation`, `deal-health`, `audit`.

## DETERMINISM

The following must be deterministic: quote calculation, discount limit evaluation, risk score, approval routing, recommendation ranking, warehouse allocation, invoice calculation, proration, deal-health rules.

**AI is never authoritative.** AI may summarize, explain, and generate optional natural language insights.

## VALIDATION

All user input must be validated at the API/service layer using Zod schemas.

## ERROR HANDLING

Never silently ignore failed transactions, authorization errors, database errors, validation errors, or AI failures. AI failures must degrade gracefully.

## AUDIT

Record important business actions. Audit records must be immutable.

## HISTORICAL DATA

Do not overwrite business history when a new revision is required. Quotes, approvals, negotiations, billing records and audit events must remain traceable.

## CODING STYLE

- strict TypeScript
- explicit types
- pure domain functions when possible
- small services
- reusable Zod validators
- clear naming
- no `any`, no magic numbers, no static business data, no duplicated formulas, no hidden side effects, no fake metrics, no mock database logic.

## INCREMENTAL DEVELOPMENT

Implement ONLY the requested phase. Never implement future phases automatically.

## HACKATHON PRIORITY

1. correctness  2. business logic  3. end-to-end flow  4. security  5. validation  6. testability  7. UX polish  8. optional AI

The final demo must work even if the AI provider is down.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
