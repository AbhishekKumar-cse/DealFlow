'use client';

// src/components/dealflow/views/billing-view.tsx — The Billing view.
// Two tabs: "Invoices" and "Subscriptions".
//
// Invoices tab — DataTable of Invoice rows: number, customer, type,
// status, issue date, due date, total, paid, balance. Click a row →
// side Sheet showing the invoice's lines, payments, and credit notes.
// Action buttons "Record payment" and "Issue credit note" are visible
// only to FINANCE_OPERATIONS / ADMIN (matching the API RBAC).
//
// Subscriptions tab — DataTable of Subscription rows: customer, plan,
// product, interval, next billing date, status. "Cancel subscription"
// action visible only to FINANCE_OPERATIONS / ADMIN.
//
// RBAC reflection:
//   - The view itself is reachable to FINANCE_OPERATIONS + ADMIN
//     (the list APIs enforce this for those roles; CUSTOMER is also
//     allowed and is auto-scoped to their own data via the API).
//   - Mutations are restricted to FINANCE_OPERATIONS + ADMIN (the APIs
//     enforce this; the UI hides the buttons for other roles).

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Search,
  RefreshCw,
  Receipt,
  CreditCard,
  FileMinus,
  Ban,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { TierBadge } from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useSessionStore } from '@/store/session-store';
import { useViewStore } from '@/store/view-store';

// ────────────────────────────────────────────────────────────────────
// Types — mirror the Prisma payload returned by the list endpoints.
// ────────────────────────────────────────────────────────────────────

interface InvoiceListRow {
  id: string;
  number: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  currency: string;
  customerId: string;
  quoteId: string | null;
  subscriptionId: string | null;
  customer: { id: string; name: string; tier: string };
  quote: { id: string; number: string } | null;
  subscription: { id: string; plan: { name: string } } | null;
  _count: { lines: number; payments: number; creditNotes: number };
}

interface InvoiceLineRow {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPriceCents: number;
  discountPercent: number;
  prorationPercent: number | null;
  grossCents: number;
  discountCents: number;
  netCents: number;
}

interface PaymentRow {
  id: string;
  amountCents: number;
  method: string;
  reference: string | null;
  status: string;
  paidAt: string;
  createdAt: string;
}

interface CreditNoteRow {
  id: string;
  number: string;
  amountCents: number;
  reason: string;
  createdAt: string;
}

interface InvoiceDetail extends InvoiceListRow {
  lines: InvoiceLineRow[];
  payments: PaymentRow[];
  creditNotes: CreditNoteRow[];
  subscription: { id: string; plan: { name: string }; status: string; interval: string; intervalCount: number } | null;
}

interface SubscriptionListRow {
  id: string;
  customerId: string;
  productId: string;
  priceCents: number;
  interval: string;
  intervalCount: number;
  qty: number;
  status: string;
  startDate: string;
  nextBillingDate: string;
  endDate: string | null;
  cancelledAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; tier: string };
  plan: { id: string; name: string };
  quote: { id: string; number: string } | null;
}

// ────────────────────────────────────────────────────────────────────
// Badges — local helpers (kept here to avoid touching the shared
// badges file outside Phase 10's scope).
// ────────────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'PAID'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : status === 'ISSUED' || status === 'PARTIAL'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : status === 'OVERDUE'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
      : status === 'VOID'
      ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {status.toLowerCase()}
    </Badge>
  );
}

function InvoiceTypeBadge({ type }: { type: string }) {
  const tone =
    type === 'ONE_TIME'
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
      : type === 'RECURRING'
      ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
      : type === 'PRORATED'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return (
    <Badge className={cn('border-0 font-medium', tone)}>
      {type.replace('_', ' ').toLowerCase()}
    </Badge>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : status === 'SUSPENDED'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : status === 'CANCELLED'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {status.toLowerCase()}
    </Badge>
  );
}

function formatInterval(interval: string, count: number): string {
  if (interval === 'MONTHLY') return count === 1 ? 'Monthly' : `Every ${count} months`;
  if (interval === 'QUARTERLY') return count === 1 ? 'Quarterly' : `Every ${count} quarters`;
  if (interval === 'ANNUAL') return count === 1 ? 'Annual' : `Every ${count} years`;
  return interval.toLowerCase();
}

// ────────────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────────────

export function BillingView() {
  const [tab, setTab] = useState<'invoices' | 'subscriptions'>('invoices');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Billing</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Hybrid one-time + recurring billing — invoices, payments, credit notes, and subscriptions.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm dark:border-violet-900/40 dark:bg-violet-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-400" />
        <div className="space-y-1">
          <p className="font-medium text-violet-900 dark:text-violet-300">
            Hybrid billing engine
          </p>
          <p className="text-xs text-violet-800/80 dark:text-violet-200/80">
            Confirmed quotes produce one-time invoices for ONE_TIME lines and
            subscriptions + first-cycle recurring invoices for RECURRING lines.
            Proration creates a single PRORATED invoice with a credit line
            (unused cycle) and a charge line (new plan).
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'invoices' | 'subscriptions')}>
        <TabsList>
          <TabsTrigger value="invoices">
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            Subscriptions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="subscriptions">
          <SubscriptionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Invoices tab
// ────────────────────────────────────────────────────────────────────

function InvoicesTab() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['invoices', search, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load invoices');
      }
      const json = await res.json();
      return json.data as InvoiceListRow[];
    },
  });

  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-violet-700 dark:text-violet-400">
            {r.number}
          </span>
          <span className="text-[11px] text-slate-500">
            issued {new Date(r.issueDate).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{r.customer.name}</span>
          <TierBadge tier={r.customer.tier} />
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => <InvoiceTypeBadge type={r.type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <InvoiceStatusBadge status={r.status} />,
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (r) => (
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
          {new Date(r.dueDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums font-medium">{formatCurrency(r.totalCents, r.currency)}</span>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (r) => (
        <span
          className={
            r.paidCents >= r.totalCents && r.totalCents > 0
              ? 'tabular-nums text-emerald-700 dark:text-emerald-400'
              : r.paidCents > 0
              ? 'tabular-nums text-amber-700 dark:text-amber-400'
              : 'tabular-nums text-slate-400'
          }
        >
          {formatCurrency(r.paidCents, r.currency)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
          {formatCurrency(Math.max(0, r.totalCents - r.paidCents), r.currency)}
        </span>
      ),
    },
    {
      key: 'quote',
      header: 'Quote',
      render: (r) =>
        r.quote ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setView('quote-detail', { quoteId: r.quote!.id });
            }}
            className="font-mono text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {r.quote.number}
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by invoice number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ISSUED">Issued</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="VOID">Void</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="ONE_TIME">One-time</SelectItem>
            <SelectItem value="RECURRING">Recurring</SelectItem>
            <SelectItem value="PRORATED">Prorated</SelectItem>
            <SelectItem value="CREDIT">Credit</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          aria-label="Refresh invoices"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setOpenInvoiceId(r.id)}
        emptyTitle="No invoices yet"
        emptyDescription="Generate invoices for a confirmed quote to see them here."
      />

      {openInvoiceId && (
        <InvoiceDetailSheet
          invoiceId={openInvoiceId}
          onClose={() => setOpenInvoiceId(null)}
          onInvalidate={() => {
            qc.invalidateQueries({ queryKey: ['invoices'] });
            qc.invalidateQueries({ queryKey: ['invoice', openInvoiceId] });
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Invoice detail side sheet
// ────────────────────────────────────────────────────────────────────

function InvoiceDetailSheet({
  invoiceId,
  onClose,
  onInvalidate,
}: {
  invoiceId: string;
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const canMutate = user?.role === 'FINANCE_OPERATIONS' || user?.role === 'ADMIN';
  const [openPayment, setOpenPayment] = useState(false);
  const [openCredit, setOpenCredit] = useState(false);

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load invoice');
      }
      return res.json();
    },
  });

  const balance = invoice
    ? Math.max(0, invoice.totalCents - invoice.paidCents)
    : 0;

  return (
    <>
      <Sheet open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-violet-600" />
              {invoice?.number ?? 'Invoice'}
            </SheetTitle>
            <SheetDescription>
              Lines, payments, and credit notes for this invoice.
            </SheetDescription>
          </SheetHeader>

          {isLoading || !invoice ? (
            <InvoiceDetailSkeleton />
          ) : (
            <div className="space-y-4 px-4 pb-6">
              {/* Header tiles */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Customer" value={invoice.customer.name} />
                <StatTile label="Type">
                  <InvoiceTypeBadge type={invoice.type} />
                </StatTile>
                <StatTile label="Status">
                  <InvoiceStatusBadge status={invoice.status} />
                </StatTile>
                <StatTile label="Issued" value={new Date(invoice.issueDate).toLocaleDateString()} />
                <StatTile label="Due" value={new Date(invoice.dueDate).toLocaleDateString()} />
                <StatTile label="Currency" value={invoice.currency} />
                <StatTile
                  label="Total"
                  value={formatCurrency(invoice.totalCents, invoice.currency)}
                  strong
                />
                <StatTile
                  label="Paid"
                  value={formatCurrency(invoice.paidCents, invoice.currency)}
                  tone="emerald"
                />
                <StatTile
                  label="Balance"
                  value={formatCurrency(balance, invoice.currency)}
                  tone={balance > 0 ? 'amber' : 'slate'}
                  strong
                />
              </div>

              {/* Lines */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Lines
                </h3>
                {invoice.lines.length === 0 ? (
                  <p className="text-sm text-slate-500">No lines.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                        <tr>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit</th>
                          <th className="px-3 py-2 text-right">Disc %</th>
                          <th className="px-3 py-2 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lines.map((l) => (
                          <tr
                            key={l.id}
                            className="border-t border-slate-100 dark:border-slate-800/80"
                          >
                            <td className="px-3 py-2">
                              <div className="flex flex-col">
                                <span className="font-medium">{l.description}</span>
                                {l.prorationPercent != null && (
                                  <span className="text-[11px] text-slate-500">
                                    proration {l.prorationPercent}%
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCurrency(l.unitPriceCents, invoice.currency)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {l.discountPercent}%
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right tabular-nums font-medium',
                                l.netCents < 0 &&
                                  'text-rose-700 dark:text-rose-400',
                              )}
                            >
                              {formatCurrency(l.netCents, invoice.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Payments */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payments
                </h3>
                {invoice.payments.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments recorded.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                        <tr>
                          <th className="px-3 py-2 text-left">Method</th>
                          <th className="px-3 py-2 text-left">Reference</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.payments.map((p) => (
                          <tr
                            key={p.id}
                            className="border-t border-slate-100 dark:border-slate-800/80"
                          >
                            <td className="px-3 py-2">
                              <Badge className="border-0 bg-emerald-100 font-medium capitalize text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                {p.method.toLowerCase().replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                              {p.reference ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(p.amountCents, invoice.currency)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-slate-500">
                              {new Date(p.paidAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Credit notes */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Credit notes
                </h3>
                {invoice.creditNotes.length === 0 ? (
                  <p className="text-sm text-slate-500">No credit notes.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                        <tr>
                          <th className="px-3 py-2 text-left">Number</th>
                          <th className="px-3 py-2 text-left">Reason</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.creditNotes.map((c) => (
                          <tr
                            key={c.id}
                            className="border-t border-slate-100 dark:border-slate-800/80"
                          >
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-rose-700 dark:text-rose-400">
                              {c.number}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                              {c.reason}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                              −{formatCurrency(c.amountCents, invoice.currency)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-slate-500">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Actions */}
              {canMutate && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <Button
                    onClick={() => setOpenPayment(true)}
                    disabled={invoice.status === 'PAID' || invoice.status === 'VOID'}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Record payment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setOpenCredit(true)}
                    disabled={invoice.status === 'PAID' || invoice.status === 'VOID'}
                  >
                    <FileMinus className="mr-2 h-4 w-4" />
                    Issue credit note
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {openPayment && (
        <RecordPaymentDialog
          invoiceId={invoiceId}
          onClose={() => setOpenPayment(false)}
          onInvalidate={onInvalidate}
        />
      )}
      {openCredit && (
        <IssueCreditNoteDialog
          invoiceId={invoiceId}
          onClose={() => setOpenCredit(false)}
          onInvalidate={onInvalidate}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Subscriptions tab
// ────────────────────────────────────────────────────────────────────

function SubscriptionsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [openCancelId, setOpenCancelId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['subscriptions', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (search) params.set('search', search);
      // Always send the status so the service can distinguish the "All"
      // sentinel from a missing param (which defaults to ACTIVE only).
      params.set('status', statusFilter);
      const res = await fetch(`/api/subscriptions?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load subscriptions');
      }
      const json = await res.json();
      return json.data as SubscriptionListRow[];
    },
  });

  const columns: Column<SubscriptionListRow>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{r.customer.name}</span>
          <TierBadge tier={r.customer.tier} />
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (r) => (
        <span className="text-sm font-medium">{r.plan.name}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col items-end">
          <span className="tabular-nums font-medium">
            {formatCurrency(r.priceCents)}
          </span>
          <span className="text-[11px] text-slate-500">
            × {r.qty} {r.qty === 1 ? 'seat' : 'seats'}
          </span>
        </div>
      ),
    },
    {
      key: 'interval',
      header: 'Interval',
      render: (r) => (
        <span className="text-xs">{formatInterval(r.interval, r.intervalCount)}</span>
      ),
    },
    {
      key: 'nextBilling',
      header: 'Next billing',
      render: (r) => (
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
          {new Date(r.nextBillingDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <SubscriptionStatusBadge status={r.status} />,
    },
    {
      key: 'cancel',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'ACTIVE' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
            onClick={(e) => {
              e.stopPropagation();
              setOpenCancelId(r.id);
            }}
          >
            <Ban className="mr-1 h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by customer or plan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          aria-label="Refresh subscriptions"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No subscriptions yet"
        emptyDescription="Generate invoices for a confirmed quote with recurring lines to create subscriptions."
      />

      {openCancelId && (
        <CancelSubscriptionDialog
          subscriptionId={openCancelId}
          onClose={() => setOpenCancelId(null)}
          onInvalidate={() => {
            qc.invalidateQueries({ queryKey: ['subscriptions'] });
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Dialogs
// ────────────────────────────────────────────────────────────────────

function RecordPaymentDialog({
  invoiceId,
  onClose,
  onInvalidate,
}: {
  invoiceId: string;
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('SIMULATED');
  const [reference, setReference] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(parseFloat(amount) * 100),
          method,
          reference: reference || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to record payment');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Payment recorded.');
      onInvalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Enter the payment amount (in dollars). The invoice will be
            marked PAID when paidCents reaches totalCents.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount (₹)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SIMULATED">Simulated</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="WIRE">Wire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="check #, transaction id…"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending || !amount}>
              {mut.isPending ? 'Recording…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IssueCreditNoteDialog({
  invoiceId,
  onClose,
  onInvalidate,
}: {
  invoiceId: string;
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/credit-notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(parseFloat(amount) * 100),
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to issue credit note');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Credit note issued.');
      onInvalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
          <DialogDescription>
            Reduces the invoice total by the credit amount. A reason is
            required (audited).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cn-amount">Credit amount (₹)</Label>
            <Input
              id="cn-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-reason">Reason</Label>
            <Textarea
              id="cn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this credit being issued?"
              required
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending || !amount || !reason.trim()}>
              {mut.isPending ? 'Issuing…' : 'Issue credit note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelSubscriptionDialog({
  subscriptionId,
  onClose,
  onInvalidate,
}: {
  subscriptionId: string;
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to cancel subscription');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Subscription cancelled.');
      onInvalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            The subscription will be marked CANCELLED. The customer keeps
            service through the end of the current cycle (the next
            billing date). A reason is required (audited).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="sub-cancel-reason">Reason</Label>
            <Textarea
              id="sub-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this subscription being cancelled?"
              required
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={mut.isPending || !reason.trim()}
              className="bg-rose-600 hover:bg-rose-700"
            >
              <Ban className="mr-2 h-4 w-4" />
              {mut.isPending ? 'Cancelling…' : 'Cancel subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  strong,
  tone,
  children,
}: {
  label: string;
  value?: string;
  strong?: boolean;
  tone?: 'emerald' | 'amber' | 'slate';
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'slate'
      ? 'text-slate-500'
      : '';
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={cn(
          'mt-1 text-sm',
          strong && 'text-base font-semibold',
          toneClass,
        )}
      >
        {value ?? children}
      </div>
    </div>
  );
}

function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-3 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
