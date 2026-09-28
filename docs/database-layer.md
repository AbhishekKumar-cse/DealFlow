# DealFlow360 Database Layer

This project has **two SQL databases**:

## 1. Main Database — `db/custom.db` (Prisma + SQLite)

The production database holding all real business data. Managed by Prisma ORM.

- **Schema:** `prisma/schema.prisma` (37 tables)
- **Raw SQL DDL:** `db/schema.sql` (generated via `bun run db:schema:export`)
- **Connection:** `DATABASE_URL=file:/home/z/my-project/db/custom.db` (in `.env`)
- **Access:** `import { db } from '@/lib/db'` (Prisma Client singleton)
- **Migrations:** `bun run db:push` (apply schema), `bun run db:migrate` (create migration)

### Tables (37)
`User`, `Customer`, `CustomerContact`, `ProductCategory`, `Product`, `ProductAssociation`, `PriceList`, `PriceListItem`, `DiscountRule`, `RiskConfig`, `ApprovalChain`, `ApprovalChainStep`, `Quote`, `QuoteRevision`, `QuoteLine`, `ApprovalRequest`, `ApprovalDecision`, `Warehouse`, `WarehouseStock`, `FulfillmentOrder`, `FulfillmentAllocation`, `Backorder`, `SubscriptionPlan`, `Subscription`, `Invoice`, `InvoiceLine`, `Payment`, `CreditNote`, `PurchaseEvent`, `RecommendationSnapshot`, `NegotiationRequest`, `NegotiationChange`, `NegotiationComment`, `DealHealthEvent`, `DealHealthConfig`, `AuditEvent`, `Notification`

---

## 2. Temp Database — `db/temp.db` (Raw SQLite)

A separate scratch database for storing **temporary data** that should auto-expire.
Independent of Prisma — managed via raw SQL through Node's built-in `node:sqlite`.

- **Schema:** `db/temp-schema.sql`
- **Init script:** `scripts/init-temp-db.ts`
- **Purge script:** `scripts/purge-temp-db.ts`
- **Connection:** `db/temp.db` (raw SQLite file)

### Tables (6)

| Table | Purpose | TTL |
|---|---|---|
| `TempCustomer` | Scratch customer records for testing/demo | `expiresAt` column |
| `TempProduct` | Scratch product records | `expiresAt` column |
| `TempQuote` | Sandbox quote drafts (lines stored as JSON) | `expiresAt` column |
| `TempSession` | Ephemeral user sessions / draft states | `expiresAt` column |
| `TempLog` | Scratch log entries (debug, audit previews) | `expiresAt` column |
| `TempCache` | Simple key/value cache for expensive computations | `expiresAt` column |

### Views (2)

- `v_ActiveTempQuotes` — non-expired, non-cancelled temp quotes with customer info
- `v_ExpiredTempRecords` — all rows across all temp tables whose `expiresAt <= now`

### Scripts

```bash
# Initialize (or re-initialize) the temp database from schema
bun run db:temp:init       # or: node --experimental-sqlite scripts/init-temp-db.ts

# Purge expired records (run on a cron)
bun run db:temp:purge      # or: node --experimental-sqlite scripts/purge-temp-db.ts

# Export the main DB schema as raw SQL
bun run db:schema:export   # writes db/schema.sql
```

### Accessing the temp database from code

```typescript
// Example: read from temp db (server-side only)
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const tempDbPath = resolve(process.cwd(), 'db/temp.db');
const db = new DatabaseSync(tempDbPath);
const rows = db.prepare('SELECT * FROM TempCustomer WHERE expiresAt > datetime(?)').all(new Date().toISOString());
db.close();
```

---

## File Layout

```
db/
├── custom.db          # Main SQLite database (Prisma) — 37 tables
├── schema.sql         # Raw SQL DDL for the main DB (generated)
├── temp-schema.sql    # Schema for the temp DB (hand-written)
└── temp.db            # Temp SQLite database — 6 tables + 2 views
```

## Why two databases?

The **main DB** holds real, persistent business data (customers, quotes, invoices, audit trail). It must never be dropped casually.

The **temp DB** is a scratch space for:
- Demo data that should auto-expire (24h TTL by default)
- Sandbox quote drafts the user is experimenting with
- Ephemeral session state
- Cache entries with TTL
- Debug logs that should be purged periodically

Keeping them separate means the purge script can wipe temp data without touching real records, and the main DB stays clean for production use.
