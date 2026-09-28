# Business Rules

## Customer Tiers

Each customer is assigned exactly one tier (`BRONZE`, `SILVER`, `GOLD`, `PLATINUM`). The tier drives discount ceilings.

## Discount Governance

### Rule resolution precedence (most specific wins)

1. **Product-specific + customer-tier-specific** rule (highest priority)
2. **Category + customer-tier** rule
3. **Customer-tier-only** rule
4. **Category-only** rule
5. **Global default** rule (lowest priority)

If no rule matches, the default ceiling is `0%`.

### Example (from spec)

Gold customer:

| Category  | Ceiling |
| --------- | ------- |
| Hardware  | 15%     |
| Services  | 10%     |

Flagship quote:

- Laptop (Hardware) at 12% → within ceiling → no overage
- Setup Service (Services) at 18% → 8 percentage-point overage → risk contribution

## Blended Risk Score

For each quote line:

```
overage_pct        = max(0, requested_discount_pct - allowed_discount_pct)
discount_severity  = overage_pct / max(allowed_discount_pct, MIN_DENOMINATOR)
revenue_weight     = line_net_value / total_quote_net_value
margin_ratio       = max(0, gross_margin / max(line_net_value, MIN_DENOMINATOR))
line_risk_contrib  = normalize(discount_severity × revenue_weight × margin_factor(margin_ratio))
```

Aggregated across lines plus configurable penalties:

- multiple violating lines
- high revenue concentration
- low margin
- repeated negotiation increases
- unusually high total discount

Final score is `0..100` then classified into configurable bands:

| Band     | Default range | Required approval |
| -------- | ------------- | ----------------- |
| SAFE     | 0 – 24        | auto-approve      |
| REVIEW   | 25 – 49       | manager           |
| MANAGER  | 50 – 74       | manager           |
| FINANCE  | 75 – 100      | finance           |

Exact thresholds are **configuration**, not hardcoded constants.

## Approval Workflow

States: `DRAFT → SUBMITTED → PENDING_MANAGER → PENDING_FINANCE → APPROVED → CONFIRMED → FULFILLING → FULFILLED` (or `REJECTED` / `RETURNED` / `CANCELLED`).

### On submit

1. validate quote
2. recalculate quote
3. evaluate discount governance
4. calculate risk
5. determine required approval level
6. create approval request
7. route to correct approver
8. create audit event

### Security

- No self-approval.
- Role enforcement (manager vs finance).
- Cannot approve cancelled/rejected/stale quote.
- Approval authority is configuration-driven.

### Stale approval invalidation

When a quote materially changes after approval (e.g. customer counter-offer raises discount above the ceiling):

1. compare quote version
2. invalidate stale approval (if configured)
3. recalculate risk
4. create new approval request
5. re-route

## Fulfillment Optimizer

Objective order:

1. **Primary**: minimize number of warehouses used.
2. **Secondary**: minimize shipping cost.
3. **Tertiary**: maximize fulfilled quantity if complete fulfillment is impossible.

For a small number of warehouses, evaluate all feasible subsets to guarantee the optimum (rather than naive greedy).

Backorders are created for shortages. Manual overrides require a reason and emit an audit event.

## Hybrid Billing

Quote lines are either `ONE_TIME` or `RECURRING`.

- `ONE_TIME` → invoice line on confirmation.
- `RECURRING` → subscription line + billing schedule + recurring charges on each cycle.

Proration uses calendar-aware math:

```
prorated_amount = remaining_billable_days / total_cycle_days × cycle_price
```

All money is integer cents; no floating point in calculations.

## Customer Portal

Customer may:

- sign in
- view own organization
- view own quotations and customer-visible lines/totals
- add comments
- propose quantity/discount changes
- submit counter-offer

Customer must NOT see internal margin, risk, or approval notes. Customer proposals never directly mutate quotes — they create negotiation requests which re-enter the approval workflow if they breach ceilings.

Example (from spec):

- Initial laptop discount = 12%
- Customer counter = 22%
- If 22% exceeds the configured ceiling → risk recalculated → prior approval invalidated → manager re-approval required.
- Customer sees: "Your proposed change requires additional approval."

## Deal Health

Detectors (all thresholds configurable):

1. **STALLED** — quote in `PENDING_*` longer than configured SLA.
2. **APPROVAL_SLA_BREACH** — approver did not act within SLA.
3. **DELIVERY_SLIPPAGE** — promised date later than commitment.
4. **DISCOUNT_ANOMALY** — current discount exceeds historical rep/customer behavior threshold.
5. **MARGIN_DETERIORATION** — margin drops below threshold.
6. **NEGOTIATION_ESCALATION** — customer repeatedly raises discounts.

All detectors are deterministic. No machine learning.

## Audit

Audit events are **immutable**. Important operations (quote create/edit/submit, discount update, risk evaluation, approval, rejection, return, negotiation, approval invalidation, warehouse allocation/override, inventory adjustment, invoice, payment, credit note, subscription change, configuration change) all emit audit events with `actor_id`, `actor_role`, `entity_type`, `entity_id`, `action`, `old_value`, `new_value`, `reason`, `correlation_id`, `created_at`.

## AI Layer (optional)

AI features (powered by `z-ai-web-dev-sdk`):

1. Explain quote risk in natural language.
2. Summarize a deal.
3. Explain an approval decision.
4. Generate sales talking points.

AI receives **structured facts** from deterministic services. AI must NOT calculate or override risk, discounts, approvals, allocation, invoice or payment totals. AI responses are validated with Zod. If AI fails, the deterministic fallback is shown; the workflow is never blocked.
