# Demo Flow — Flagship User Journey

```
1.  Sales Rep signs in
2.  Opens Dashboard          — sees pipeline, at-risk deals, pending approvals
3.  Creates quote for Acme (Gold)
        - Laptop (Hardware)       qty 3   discount 12%   → within ceiling
        - Setup Service (Services) qty 1   discount 18%   → 8pp overage
4.  Risk engine evaluates live   → band = MANAGER, score ≈ 62
        - Explainer: "Setup Service has an 18% discount against a configured
          10% ceiling, creating an 8 percentage-point overage."
5.  Recommendation panel        → "Add Docking Station" (strong co-purchase)
6.  Submit                      → routed to MANAGER approval
7.  Manager signs in → approves
8.  Finance/Operations runs fulfillment optimizer
        - Main Warehouse has 1 laptop, East Depot has 2 laptops
        - System splits: Main(1) + East(2)
        - Explainer: "Selected 2 warehouses because no single warehouse can
          satisfy the requested quantity."
9.  Billing
        - One-time invoice for Laptop + Setup Service
        - Recurring subscription for Premium Support (monthly)
10. Customer signs into Portal
        - Sees own quote
        - Proposes laptop discount 12% → 22%
11. System recalculates risk      → band escalates
        - Prior approval invalidated
        - Manager re-approval required
        - Customer sees: "Your proposed change requires additional approval."
12. Manager re-approves
13. Dashboard auto-refreshes      — deal-health turns green, audit trail complete
```

The "wow" moments are **risk explainability**, **warehouse split reasoning**, and **automatic stale-approval invalidation**.
