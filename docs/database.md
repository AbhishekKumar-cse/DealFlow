# Database

> Prisma + SQLite. Money is stored as **integer cents** (`Int`). Percentages as integer percent (`0..100`).
> SQLite does not support Prisma enums, so discriminating columns are `String` validated at the application layer via Zod schemas in `src/lib/enums.ts`.
> All historical records (quote revisions, approval decisions, negotiation changes, audit events) are **append-only**.

## Entity map

### Identity & Access
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `User`               | Credentials + role. `customerId` set only for CUSTOMER role. |
| `Customer`           | Organization. Tier drives discount ceilings. `assignedRepId` → User. |
| `CustomerContact`    | People at a customer (procurement, IT director …). |

### Products & Pricing
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `ProductCategory`    | Hardware / Accessories / Services / Subscriptions. |
| `Product`            | `billingType` (ONE_TIME/RECURRING), cost cents, list price cents, default interval. |
| `ProductAssociation` | Co-purchase strength (primary → related, 0..100). |
| `PriceList`          | Named price list with `isDefault` flag.            |
| `PriceListItem`      | Per-product override price. Unique `(priceListId, productId)`. |

### Discount Governance & Risk
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `DiscountRule`       | Scope filters (tier/category/product), `maxPercent`, `warnPercent`, `priority`. |
| `RiskConfig`         | Band thresholds + penalty weights. Single active row by convention. |

### Approvals
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `ApprovalChain`      | Trigger band + steps.                              |
| `ApprovalChainStep`  | `order`, `requiredRole`, optional `approverId`.    |
| `ApprovalRequest`    | Created per submission. `currentStep`, `requiredRole`, `status`. |
| `ApprovalDecision`   | Per-step decision record (audit-friendly).        |

### Quotation
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `Quote`              | Header. Denormalized totals + risk snapshot.       |
| `QuoteRevision`      | Append-only history. `linesSnapshot` (JSON string), totals, risk. |
| `QuoteLine`          | Per-line snapshot (qty, unitPrice, discount, net, cost, margin, allowedDiscount). |

### Fulfillment
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `Warehouse`          | `code`, `region`, `shippingCostCents`, `active`.   |
| `WarehouseStock`     | On-hand qty. Unique `(warehouseId, productId)`.    |
| `FulfillmentOrder`   | Per quote. `status`, `warehousesUsed`, `shippingCostCents`, `explanation`. |
| `FulfillmentAllocation` | Per line/warehouse allocation. `manualOverride` flag, `reason`. |
| `Backorder`          | Short qty per line. `resolvedAt` when filled.       |

### Billing
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `SubscriptionPlan`   | Recurring plan template (interval, intervalCount, price). |
| `Subscription`       | Active recurring line for a customer. `nextBillingDate`. |
| `Invoice`            | One-time or recurring cycle invoice. `paidCents` sum. |
| `InvoiceLine`        | Per-line, with optional `prorationPercent`.        |
| `Payment`            | Simulated/internal payment record.                 |
| `CreditNote`         | Refund/adjustment against an invoice.              |

### Recommendations & Negotiation
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `PurchaseEvent`      | Historical co-purchase signal.                    |
| `RecommendationSnapshot` | Persisted recommendation with 4 normalized signals + reasons + expected margin impact. |
| `NegotiationRequest` | Customer counter-offer. `status` (OPEN/ACCEPTED/REJECTED/SUPERSEDED). |
| `NegotiationChange`  | Field-level change with risk impact + `invalidatesApproval` flag. |
| `NegotiationComment` | Thread. `internal` flag hides from customer.       |

### Deal Health
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `DealHealthEvent`    | Detected anomaly. `type`, `severity`, `status`, `evidence`, `recommendedAction`. |
| `DealHealthConfig`   | Thresholds for all detectors. Single active row.   |

### Audit & Notifications
| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `AuditEvent`         | Immutable log. `actorId`, `entityType`, `entityId`, `action`, `oldValue`, `newValue`, `reason`, `correlationId`. Indexed by entity + actor + quote + createdAt. |
| `Notification`       | Optional in-app notifications per user.            |

## Important relationships

```
User (1) ──< Quote >── (1) Customer
              │
              ├──< QuoteLine >── Product
              ├──< QuoteRevision >── User (createdBy)
              ├──< ApprovalRequest >──< ApprovalDecision >── User (approver)
              ├──< FulfillmentOrder >──< FulfillmentAllocation >── Warehouse
              ├──< Invoice >──< InvoiceLine / Payment / CreditNote
              ├──< Subscription >── SubscriptionPlan
              ├──< NegotiationRequest >──< NegotiationChange / NegotiationComment >
              ├──< DealHealthEvent >
              └──< AuditEvent >

DiscountRule ──(tier? × category? × product?)── Product / Customer
RiskConfig   ──(single active row)── all quotes
ApprovalChain >──< ApprovalChainStep >── User (optional approver)
```

## Money conventions

All `*Cents` columns are Prisma `Int` representing whole cents. The `src/lib/money.ts` helpers (`fromDecimal`, `toDecimal`, `applyPercent`, `percentOf`, `prorate`, `formatCurrency`) are the only sanctioned conversion points. Floating-point math is forbidden inside domain engines.

## Index strategy

- Foreign keys: indexed.
- Status / role / band columns: indexed for dashboard queries.
- `(userId, read)` on `Notification` for fast unread count.
- `createdAt` on `AuditEvent` for timeline ordering.

## Transaction-sensitive operations

- Inventory decrement (fulfillment allocation): performed inside a Prisma transaction with row re-read to prevent negative stock.
- Quote submission (recalculate → risk → approval request → audit): one transaction.
- Approval invalidation + new request on negotiation: one transaction.
- Invoice + payment status update: one transaction.
