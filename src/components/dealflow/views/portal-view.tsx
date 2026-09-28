'use client';

// src/components/dealflow/views/portal-view.tsx — Customer-facing portal
// (Phase 11).
//
// The portal shows the customer ONLY their own organization's quotes and
// a customer-visible subset of each quote's data:
//   - Quote number, status, total, created, last update.
//   - Quote lines: product, qty, unit price, discount %, net.
//   - Quote totals: subtotal, discount, tax, total.
//   - The customer's own negotiation history on each quote.
//
// The portal deliberately does NOT show:
//   - Internal margin (per-line or quote-level).
//   - Risk score / band (or any risk panel).
//   - Recommendation panel.
//   - Fulfillment / backorder detail.
//   - Billing detail beyond an "Invoices" link out (the billing view is
//     reachable by CUSTOMER and auto-scopes to their own data).
//   - Internal notes (server-side already redacted).
//   - Approval comments (redacted to "[internal]" server-side already).
//
// From a quote detail the customer can click "Propose changes" to open a
// NegotiationProposalDialog. The dialog submits a POST to
// /api/quotes/[id]/negotiations and shows the safe customer-facing
// response message returned by the server.
//
// RBAC:
//   - The portal is reachable to the CUSTOMER role only (the sidebar only
//     shows it for CUSTOMER; the underlying APIs enforce scoping).
//   - listQuotes (used by PortalQuoteList) auto-scopes to the customer's
//     own organization when the session role is CUSTOMER.
//   - getQuote (used by PortalQuoteDetail) rejects customers trying to
//     view another organization's quote (ForbiddenError) and the
//     per-quote approvals endpoint redacts internal comments to "[internal]".

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Receipt, Send, MessageSquare, Info } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { QuoteStatusBadge, NegotiationStatusBadge } from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useViewStore } from '@/store/view-store';

// ──────────────────────────────────────────────────────────────────────
// Types — customer-visible subsets of the API responses.
// ──────────────────────────────────────────────────────────────────────

interface PortalQuoteRow {
  id: string;
  number: string;
  status: string;
  revision: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

interface PortalQuoteLine {
  id: string;
  productName: string;
  billingType: string;
  interval: string | null;
  intervalCount: number | null;
  qty: number;
  unitPriceCents: number;
  discountPercent: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
}

interface PortalQuoteDetail {
  id: string;
  number: string;
  status: string;
  revision: number;
  currency: string;
  taxPercent: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  expectedDeliveryDate: string | null;
  lines: PortalQuoteLine[];
}

interface NegotiationSummaryRow {
  id: string;
  status: string;
  invalidatesApproval: boolean;
  customerSafeMessage: string | null;
  createdAt: string;
  resolvedAt: string | null;
  changes: { id: string; field: string; oldValue: string; newValue: string }[];
}

// ──────────────────────────────────────────────────────────────────────
// Top-level component — switches between list and detail.
// ──────────────────────────────────────────────────────────────────────

export function PortalView() {
  const setView = useViewStore((s) => s.setView);
  const context = useViewStore((s) => s.context);
  const quoteId = context.quoteId as string | undefined;

  if (quoteId) {
    return (
      <PortalQuoteDetail
        quoteId={quoteId}
        onBack={() => setView('portal')}
      />
    );
  }
  return <PortalQuoteList />;
}

// ──────────────────────────────────────────────────────────────────────
// List — "My Quotes"
// ──────────────────────────────────────────────────────────────────────

function PortalQuoteList() {
  const setView = useViewStore((s) => s.setView);

  const { data, isLoading } = useQuery<PortalQuoteRow[]>({
    queryKey: ['portal-quotes'],
    queryFn: async () => {
      const res = await fetch('/api/quotes?page=1&pageSize=100');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load your quotes');
      }
      const json = await res.json();
      return json.data as PortalQuoteRow[];
    },
  });

  const columns: Column<PortalQuoteRow>[] = [
    {
      key: 'number',
      header: 'Quote',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {r.number}
          </span>
          <span className="text-[11px] text-slate-500">
            rev {r.revision} · {new Date(r.createdAt).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <QuoteStatusBadge status={r.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => (
        <span className="font-medium tabular-nums">{formatCurrency(r.totalCents)}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Last update',
      align: 'right',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {new Date(r.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">My Quotes</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Quotes for your organization. Click a quote to see the line items
          and propose changes.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-900/40 dark:bg-sky-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
        <div className="space-y-1">
          <p className="font-medium text-sky-900 dark:text-sky-300">
            Customer portal
          </p>
          <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
            You can see your organization&apos;s quotes and submit proposed
            changes (counter-offers) on any quote that is currently submitted
            or awaiting approval. Your proposals do not directly change the
            quote — they go to our team for review.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setView('portal', { quoteId: r.id })}
        emptyTitle="No quotes yet"
        emptyDescription="Your organization's quotes will appear here once a rep creates one."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Detail — customer-visible quote detail
// ──────────────────────────────────────────────────────────────────────

function PortalQuoteDetail({ quoteId, onBack }: { quoteId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [openProposal, setOpenProposal] = useState(false);

  const { data: quote, isLoading } = useQuery<PortalQuoteDetail>({
    queryKey: ['portal-quote', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load quote');
      }
      return res.json();
    },
    enabled: !!quoteId,
  });

  // Customer-visible negotiation history for this quote. The API auto-
  // scopes to the customer's own organization (ForbiddenError otherwise).
  const { data: negotiations } = useQuery<NegotiationSummaryRow[]>({
    queryKey: ['portal-negotiations', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/negotiations`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load negotiations');
      }
      const json = await res.json();
      return (json.data ?? []) as NegotiationSummaryRow[];
    },
    enabled: !!quoteId,
  });

  if (isLoading || !quote) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> My Quotes
        </Button>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const negotiable =
    quote.status === 'SUBMITTED' ||
    quote.status === 'PENDING_MANAGER' ||
    quote.status === 'PENDING_FINANCE' ||
    quote.status === 'APPROVED';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to My Quotes">
            <ArrowLeft className="mr-2 h-4 w-4" /> My Quotes
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-semibold tracking-tight">{quote.number}</h2>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <div className="text-sm text-slate-500">
              Revision {quote.revision} · Created {new Date(quote.createdAt).toLocaleDateString()}
              {quote.expectedDeliveryDate && (
                <>
                  {' '}· Expected delivery {new Date(quote.expectedDeliveryDate).toLocaleDateString()}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {negotiable && (
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => setOpenProposal(true)}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Propose changes
            </Button>
          )}
          <Button variant="outline" onClick={() => setView('billing')}>
            <Receipt className="mr-2 h-4 w-4" />
            Invoices
          </Button>
        </div>
      </div>

      {/* Lines — customer-visible columns only: product, qty, unit price,
          discount %, net. NO margin column. */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quote.lines.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
              <p>This quote has no line items yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Unit price</th>
                    <th className="px-4 py-2 text-right">Disc %</th>
                    <th className="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-slate-100 dark:border-slate-800/80"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{line.productName}</span>
                          <span className="text-xs text-slate-500">
                            {line.billingType === 'RECURRING'
                              ? `Recurring · ${line.interval?.toLowerCase()} × ${line.intervalCount ?? 1}`
                              : 'One-time'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(line.unitPriceCents, quote.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.discountPercent}%</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(line.netCents, quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/60 text-sm font-medium dark:bg-slate-900/60">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-xs uppercase tracking-wider text-slate-500">
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      −{formatCurrency(quote.discountCents, quote.currency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCurrency(quote.subtotalCents, quote.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right text-xs uppercase tracking-wider text-slate-500">
                      Tax ({quote.taxPercent}%)
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      +{formatCurrency(quote.taxCents, quote.currency)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 dark:border-slate-800">
                    <td colSpan={4} className="px-4 py-2 text-right font-semibold">Total</td>
                    <td className="px-4 py-2 text-right text-lg font-bold tabular-nums">
                      {formatCurrency(quote.totalCents, quote.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes (if any) — customer-visible. Internal notes are never
          persisted here; the API only stores customer-visible notes. */}
      {quote.notes && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 dark:text-slate-300">{quote.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Negotiation history — customer-visible. The status badges and the
          safe customer-facing message are shown; internal comments are
          filtered out server-side. */}
      {negotiations && negotiations.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Your proposals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {negotiations.map((n) => (
              <div
                key={n.id}
                className="rounded-md border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <NegotiationStatusBadge status={n.status} />
                    <span className="text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">
                    {n.changes.length} change{n.changes.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="mb-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {n.changes.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium">
                        {c.field === 'discountPercent' ? 'Discount' : 'Qty'}
                      </span>{' '}
                      from <span className="font-mono">{c.oldValue}</span> to{' '}
                      <span className="font-mono">{c.newValue}</span>
                      {c.field === 'discountPercent' ? '%' : ' units'}
                    </li>
                  ))}
                </ul>
                {n.customerSafeMessage && (
                  <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    {n.customerSafeMessage}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {openProposal && quote && (
        <NegotiationProposalDialog
          quoteId={quote.id}
          quoteNumber={quote.number}
          currency={quote.currency}
          lines={quote.lines}
          onClose={() => setOpenProposal(false)}
          onSubmitted={() => {
            setOpenProposal(false);
            qc.invalidateQueries({ queryKey: ['portal-negotiations', quoteId] });
            qc.invalidateQueries({ queryKey: ['portal-quotes'] });
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// NegotiationProposalDialog — customer submits a counter-offer
// ──────────────────────────────────────────────────────────────────────

function NegotiationProposalDialog({
  quoteId,
  quoteNumber,
  currency,
  lines,
  onClose,
  onSubmitted,
}: {
  quoteId: string;
  quoteNumber: string;
  currency: string;
  lines: PortalQuoteLine[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [lineId, setLineId] = useState<string>('');
  const [field, setField] = useState<'qty' | 'discountPercent'>('discountPercent');
  const [newValue, setNewValue] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: async () => {
      const parsedValue = parseInt(newValue, 10);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw new Error('Please enter a valid positive number.');
      }
      const body: Record<string, unknown> = {
        changes: [{ quoteLineId: lineId, field, newValue: parsedValue }],
      };
      if (message.trim()) body.message = message.trim();
      const res = await fetch(`/api/quotes/${quoteId}/negotiations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to submit proposal');
      return json.data as { safeMessage: string; requestId: string; invalidatesApproval: boolean };
    },
    onSuccess: (data) => {
      toast.success('Proposal submitted.');
      setResultMsg(data.safeMessage);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedLine = lines.find((l) => l.id === lineId);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propose changes — {quoteNumber}</DialogTitle>
          <DialogDescription>
            Pick a line, choose what to change (quantity or discount), and add
            an optional message. Your proposal goes to our team for review — it
            does not change the quote directly.
          </DialogDescription>
        </DialogHeader>

        {resultMsg ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              {resultMsg}
            </div>
            <DialogFooter>
              <Button onClick={onSubmitted} className="bg-emerald-600 hover:bg-emerald-700">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMut.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="np-line">Line</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger id="np-line">
                  <SelectValue placeholder="Pick a line to change" />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.productName} · qty {l.qty} · {l.discountPercent}% ·{' '}
                      {formatCurrency(l.netCents, currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="np-field">Change</Label>
                <Select
                  value={field}
                  onValueChange={(v) => {
                    setField(v as 'qty' | 'discountPercent');
                    setNewValue('');
                  }}
                >
                  <SelectTrigger id="np-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discountPercent">Discount %</SelectItem>
                    <SelectItem value="qty">Quantity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-new">
                  New value{field === 'discountPercent' ? ' (%)' : ' (units)'}
                </Label>
                <Input
                  id="np-new"
                  type="number"
                  min={field === 'discountPercent' ? 0 : 1}
                  max={field === 'discountPercent' ? 100 : 10000}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={selectedLine ? `current: ${
                    field === 'discountPercent'
                      ? `${selectedLine.discountPercent}%`
                      : selectedLine.qty
                  }` : ''}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="np-message">Message (optional)</Label>
              <Textarea
                id="np-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Add context for your counter-offer…"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitMut.isPending || !lineId || !newValue}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {submitMut.isPending ? (
                  <Send className="mr-2 h-4 w-4 animate-pulse" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {submitMut.isPending ? 'Submitting…' : 'Submit proposal'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
