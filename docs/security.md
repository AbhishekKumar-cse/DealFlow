# Security

## Authentication

- **NextAuth.js v4** with credentials provider (email + password).
- Passwords are hashed with `bcrypt`-equivalent (Node `crypto.scrypt`).
- Sessions are JWT-based, HTTP-only cookies.

## Authorization

Application-level RBAC enforced in every API route and service:

| Role                | Permissions                                                       |
| ------------------- | ---------------------------------------------------------------- |
| `SALES_REP`         | create/edit own drafts, submit quotes, view assigned customers    |
| `SALES_MANAGER`     | view team quotes, manager approvals, cannot finance-approve      |
| `FINANCE_OPERATIONS`| finance approval, fulfillment ops, billing ops                   |
| `CUSTOMER`          | only own organization, own quotes, own negotiations               |
| `ADMIN`             | configuration and administration                                 |

## Tenant Isolation

Customer-tenant isolation is enforced in the service layer: every quote/order/invoice query is filtered by the customer's organization. A `CUSTOMER` user can never read another organization's data, even with a guessed ID.

## Self-Approval Block

A user can never approve their own quote regardless of role. The approval service compares `approver_id` to `quote.created_by` and rejects.

## Frontend Is Not Security

Frontend route protection is convenience only. Every mutation endpoint re-checks authorization server-side.

## Audit

All sensitive operations emit immutable audit events. Audit records cannot be updated or deleted through the application API.
