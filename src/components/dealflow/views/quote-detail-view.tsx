'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Send,
  CheckCircle2,
  RefreshCw,
  Save,
  Truck,
  ArrowRightLeft,
  ReceiptText,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useViewStore } from '@/store/view-store';
import { useSessionStore } from '@/store/session-store';
import {
  QuoteStatusBadge,
  RiskBandBadge,
  TierBadge,
  ApprovalStatusBadge,
  FulfillmentStatusBadge,
} from '@/components/dealflow/badges';
import { RiskExplainer, type RiskExplanation } from '@/components/dealflow/risk-explainer';
import { RecommendationsPanel } from '@/components/dealflow/recommendations-panel';
import { HealthAlertsCard } from '@/components/dealflow/health-alerts-card';
import { AiInsightsPanel } from '@/components/dealflow/ai-insights-panel';
import { formatCurrency, formatPercent } from '@/lib/money';
import { cn } from '@/lib/utils';

interface ApprovalTimelineItem {
  id: string;
  status: string;
  currentStep: number;
  requiredRole: string;
  riskBand: string | null;
  riskScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
  requestedBy: { id: string; name: string };
  chain?: { name: string; steps: { id: string; order: number; requiredRole: string }[] } | null;
  decisions: {
    id: string;
    decision: string;
    step: number;
    comment: string | null;
    createdAt: string;
    approver: { id: string; name: string; email: string; role: string } | null;
  }[];
}

interface QuoteLineRow {
  id: string;
  productId: string;
  productName: string;
  billingType: string;
  interval: string | null;
  intervalCount: number | null;
  qty: number;
  unitPriceCents: number;
  discountPercent: number;
  /** Configured discount ceiling for this line (resolved by risk engine). */
  allowedDiscountPercent: number | null;
  grossCents: number;
  discountCents: number;
  netCents: number;
  costCents: number | null;
  marginCents: number | null;
  product: { id: string; name: string; sku: string; listPriceCents: number };
}

interface QuoteDetail {
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
  estimatedCostCents: number;
  estimatedMarginPct: number;
  riskScore: number | null;
  riskBand: string | null;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  customer: { id: string; name: string; tier: string };
  owner: { id: string; name: string; email: string };
  lines: QuoteLineRow[];
}

interface FulfillmentAllocationRow {
  id: string;
  warehouseId: string;
  productId: string;
  qty: number;
  manualOverride: boolean;
  reason: string | null;
  warehouse: { id: string; name: string; code: string };
}

interface FulfillmentBackorderRow {
  id: string;
  productId: string;
  shortQty: number;
  createdAt: string;
}

interface FulfillmentOrderDetail {
  id: string;
  quoteId: string;
  status: string;
  totalQty: number;
  fulfilledQty: number;
  shippingCostCents: number;
  warehousesUsed: number;
  explanation: string | null;
  createdAt: string;
  allocations: FulfillmentAllocationRow[];
  backorders: FulfillmentBackorderRow[];
}

interface BillingInvoiceRow {
  id: string;
  number: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  subscriptionId: string | null;
  lines: { id: string; description: string; qty: number; netCents: number }[];
}

interface BillingSubscriptionRow {
  id: string;
  status: string;
  priceCents: number;
  qty: number;
  interval: string;
  intervalCount: number;
  nextBillingDate: string;
  plan: { id: string; name: string };
}

interface BillingSummary {
  invoiceCount: number;
  totalInvoicedCents: number;
  totalPaidCents: number;
  recurringRevenueCents: number;
}

interface BillingForQuote {
  invoices: BillingInvoiceRow[];
  subscriptions: BillingSubscriptionRow[];
  summary: BillingSummary;
}

export function QuoteDetailView() {
  const qc = useQueryClient();
  const context = useViewStore((s) => s.context);
  const setView = useViewStore((s) => s.setView);
  const user = useSessionStore((s) => s.user);
  const isCustomerRole = user?.role === 'CUSTOMER';
  const quoteId = context.quoteId as string | undefined;
  const [openAddLine, setOpenAddLine] = useState(false);
  const [editLineId, setEditLineId] = useState<string | null>(null);

  const { data: quote, isLoading } = useQuery<QuoteDetail>({
    queryKey: ['quote', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) throw new Error('Failed to load quote');
      return res.json();
    },
    enabled: !!quoteId,
  });

  // Fetch live risk explanation (uses the persisted snapshot if present,
  // re-evaluates otherwise).
  const { data: risk, refetch: refetchRisk, isFetching: riskLoading } = useQuery<RiskExplanation>({
    queryKey: ['quote-risk', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/risk`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!quoteId && quote?.status !== 'DRAFT',
  });

  // Fetch approval timeline.
  const { data: approvalTimeline } = useQuery<ApprovalTimelineItem[]>({
    queryKey: ['quote-approvals', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/approvals`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!quoteId && quote?.status !== 'DRAFT',
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Submit failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Quote submitted.');
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/confirm`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Confirm failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Quote confirmed.');
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Run fulfillment on a confirmed quote (FINANCE_OPERATIONS / ADMIN / SALES_MANAGER).
  const runFulfillmentMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/fulfillment`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Fulfillment failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Fulfillment order created.');
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote-fulfillment', quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch the latest FulfillmentOrder for this quote (allocations + backorders).
  const { data: fulfillment } = useQuery<FulfillmentOrderDetail | null>({
    queryKey: ['quote-fulfillment', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/fulfillment`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.data ?? null) as FulfillmentOrderDetail | null;
    },
    enabled: !!quoteId && (quote?.status === 'FULFILLING' || quote?.status === 'FULFILLED'),
  });

  // Generate invoices + subscriptions for a confirmed quote (FINANCE_OPERATIONS /
  // ADMIN / SALES_MANAGER via the API; the UI CTA is restricted to FINANCE_OPERATIONS
  // per the Phase 10 spec).
  const generateBillingMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/billing/generate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Billing generation failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Invoices and subscriptions generated.');
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote-billing', quoteId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch billing summary for this quote (invoices + subscriptions + summary).
  const { data: billing } = useQuery<BillingForQuote | null>({
    queryKey: ['quote-billing', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/billing`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.data ?? null) as BillingForQuote | null;
    },
    enabled: !!quoteId && (quote?.status === 'FULFILLING' || quote?.status === 'FULFILLED'),
  });

  if (!quoteId) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No quote selected.
      </div>
    );
  }

  if (isLoading || !quote) {
    return <div className="text-sm text-slate-500">Loading quote…</div>;
  }

  const editable = quote.status === 'DRAFT' || quote.status === 'RETURNED';
  const canSubmit = editable && quote.lines.length > 0;
  const canConfirm = quote.status === 'APPROVED';
  const canRunFulfillment =
    quote.status === 'CONFIRMED' &&
    (user?.role === 'FINANCE_OPERATIONS' ||
      user?.role === 'ADMIN' ||
      user?.role === 'SALES_MANAGER');
  const canGenerateBilling =
    quote.status === 'CONFIRMED' && user?.role === 'FINANCE_OPERATIONS';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView('quotes')}
            aria-label="Back to quotes"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Quotes
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-semibold tracking-tight">{quote.number}</h2>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="font-medium">{quote.customer.name}</span>
              <TierBadge tier={quote.customer.tier} />
              <span>·</span>
              <span>Owner: {quote.owner.name}</span>
              <span>·</span>
              <span>Rev {quote.revision}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Dialog open={openAddLine} onOpenChange={setOpenAddLine}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Add line
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add product to quote</DialogTitle>
                  <DialogDescription>
                    Unit price is resolved from the price list (or product list price). Override optional.
                  </DialogDescription>
                </DialogHeader>
                <AddLineForm
                  quoteId={quote.id}
                  onAdded={() => {
                    setOpenAddLine(false);
                    qc.invalidateQueries({ queryKey: ['quote', quoteId] });
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
          {canSubmit && (
            <Button
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Send className="mr-2 h-4 w-4" />
              {submitMut.isPending ? 'Submitting…' : 'Submit for approval'}
            </Button>
          )}
          {canConfirm && (
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={confirmMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {confirmMut.isPending ? 'Confirming…' : 'Confirm quote'}
            </Button>
          )}
          {canRunFulfillment && (
            <Button
              onClick={() => runFulfillmentMut.mutate()}
              disabled={runFulfillmentMut.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Truck className="mr-2 h-4 w-4" />
              {runFulfillmentMut.isPending ? 'Fulfilling…' : 'Run fulfillment'}
            </Button>
          )}
          {canGenerateBilling && (
            <Button
              onClick={() => generateBillingMut.mutate()}
              disabled={generateBillingMut.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <ReceiptText className="mr-2 h-4 w-4" />
              {generateBillingMut.isPending ? 'Generating…' : 'Generate invoices'}
            </Button>
          )}
        </div>
      </div>

      {/* Risk explanation */}
      {quote.status !== 'DRAFT' ? (
        <RiskExplainer risk={risk ?? null} />
      ) : (
        <Card className="border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/40">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-wider text-slate-500">
                Risk evaluation
              </span>
              <span className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Risk is computed when the quote is submitted. Lines below show the configured ceiling per row.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchRisk();
                toast.success('Risk preview refreshed.');
              }}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${riskLoading ? 'animate-spin' : ''}`} />
              Preview risk
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Live validation banner — matches the reference design */}
      {editable && quote.lines.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Discount is checked against each line&apos;s own limit <strong>live</strong>, as soon as it is entered — not only at submit time.
          </p>
        </div>
      )}

      {/* Lines */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quote.lines.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
              <p>No lines yet. Add a product to start quoting.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
                <tr>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Disc %</th>
                  <th className="px-4 py-2 text-right">Limit</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                  {editable && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((line) => {
                  const ceiling = line.allowedDiscountPercent ?? 0;
                  const overage = Math.max(0, line.discountPercent - ceiling);
                  const isOver = overage > 0;
                  return (
                    <tr key={line.id} className={cn(
                      'border-b border-slate-100 dark:border-slate-800/80',
                      isOver && 'bg-rose-50/40 dark:bg-rose-950/10',
                    )}>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{line.productName}</span>
                          <span className="text-xs text-slate-500">
                            {line.billingType === 'RECURRING' ? `Recurring · ${line.interval?.toLowerCase()}` : 'One-time'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(line.unitPriceCents)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={isOver ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
                          {line.discountPercent}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                        {ceiling > 0 ? `${ceiling}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isOver ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                            OVER +{overage}pt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(line.netCents)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {line.marginCents != null ? formatCurrency(line.marginCents) : '—'}
                      </td>
                      {editable && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditLineId(line.id)}
                              aria-label="Edit line"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <RemoveLineButton quoteId={quote.id} lineId={line.id} lineName={line.productName} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/60 text-sm font-medium dark:bg-slate-900/60">
                <tr>
                  <td colSpan={editable ? 6 : 6} className="px-4 py-2 text-right text-xs uppercase tracking-wider text-slate-500">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(quote.subtotalCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">−{formatCurrency(quote.discountCents)}</td>
                  {editable && <td className="px-4 py-2"></td>}
                </tr>
                <tr className="border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={6} className="px-4 py-2 text-right font-semibold">Total</td>
                  <td colSpan={editable ? 2 : 1} className="px-4 py-2 text-right text-lg font-bold tabular-nums">
                    {formatCurrency(quote.totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recommendations — only on editable quotes (DRAFT / RETURNED) */}
      {(quote.status === 'DRAFT' || quote.status === 'RETURNED') && (
        <RecommendationsPanel quoteId={quote.id} />
      )}

      {/* AI insights — internal roles only, after recommendations */}
      {!isCustomerRole && <AiInsightsPanel quoteId={quote.id} />}

      {/* Approval timeline */}
      {quote.status !== 'DRAFT' && approvalTimeline && approvalTimeline.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Approval timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {approvalTimeline.map((req) => (
              <div
                key={req.id}
                className="rounded-md border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ApprovalStatusBadge status={req.status} />
                    <span className="text-xs text-slate-500">
                      Requested by {req.requestedBy.name} ·{' '}
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {req.riskBand && <RiskBandBadge band={req.riskBand} />}
                    {req.riskScore != null && (
                      <span className="text-xs tabular-nums text-slate-500">{req.riskScore}/100</span>
                    )}
                  </div>
                </div>
                {req.decisions.length === 0 ? (
                  <p className="text-xs italic text-slate-500">Awaiting decision from {req.requiredRole.replace('_', ' ').toLowerCase()}.</p>
                ) : (
                  <ol className="space-y-2">
                    {req.decisions.map((d) => (
                      <li key={d.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                          {d.step}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <ApprovalStatusBadge status={d.decision} />
                            <span className="text-xs text-slate-500">
                              {d.approver?.name ?? 'Unknown'} ·{' '}
                              {new Date(d.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {d.comment && (
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                              &ldquo;{d.comment}&rdquo;
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Health alerts card — Phase 12. Appears after the Approval timeline
          card. Guarded by non-DRAFT / non-CANCELLED / non-REJECTED status. */}
      {quote.status !== 'DRAFT' &&
        quote.status !== 'CANCELLED' &&
        quote.status !== 'REJECTED' && <HealthAlertsCard quoteId={quote.id} />}

      {/* Fulfillment summary card — only after the approval timeline.
          Guarded by status FULFILLING or FULFILLED (per Phase 09 spec). */}
      {(quote.status === 'FULFILLING' || quote.status === 'FULFILLED') && (
        <FulfillmentSummaryCard
          fulfillment={fulfillment ?? null}
          canRetry={
            quote.status === 'FULFILLING' && user?.role === 'FINANCE_OPERATIONS'
          }
          onRetry={() => runFulfillmentMut.mutate()}
          retrying={runFulfillmentMut.isPending}
          productNameById={Object.fromEntries(
            quote.lines.map((l) => [l.productId, l.productName]),
          )}
        />
      )}

      {/* Billing summary card — only after the fulfillment card.
          Guarded by status FULFILLING or FULFILLED (per Phase 10 spec).
          Shows invoice count, total invoiced, total paid, and recurring
          revenue from active subscriptions. */}
      {(quote.status === 'FULFILLING' || quote.status === 'FULFILLED') && (
        <BillingSummaryCard billing={billing ?? null} />
      )}

      {/* Edit line dialog */}
      <Dialog open={editLineId !== null} onOpenChange={(o) => !o && setEditLineId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit line</DialogTitle>
          </DialogHeader>
          {editLineId && (
            <EditLineForm
              quoteId={quote.id}
              lineId={editLineId}
              line={quote.lines.find((l) => l.id === editLineId)!}
              onSaved={() => {
                setEditLineId(null);
                qc.invalidateQueries({ queryKey: ['quote', quoteId] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddLineForm({ quoteId, onAdded }: { quoteId: string; onAdded: () => void }) {
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [unitPrice, setUnitPrice] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products-for-line'],
    queryFn: async () => {
      const res = await fetch('/api/products?page=1&pageSize=200');
      const json = await res.json();
      return json.data as { id: string; name: string; sku: string; listPriceCents: number; billingType: string }[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId,
          qty: parseInt(qty, 10) || 1,
          discountPercent: parseInt(discountPercent, 10) || 0,
          unitPriceCents: unitPrice ? Math.round(parseFloat(unitPrice) * 100) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Line added.');
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        addMut.mutate();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="al-product">Product</Label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger id="al-product">
            <SelectValue placeholder="Pick a product" />
          </SelectTrigger>
          <SelectContent>
            {(products ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.sku}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="al-qty">Qty</Label>
          <Input
            id="al-qty"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="al-disc">Discount %</Label>
          <Input
            id="al-disc"
            type="number"
            min="0"
            max="100"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="al-price">Unit price (override)</Label>
          <Input
            id="al-price"
            type="number"
            step="0.01"
            min="0"
            placeholder="auto"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={addMut.isPending || !productId}>
          {addMut.isPending ? 'Adding…' : 'Add line'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditLineForm({
  quoteId,
  lineId,
  line,
  onSaved,
}: {
  quoteId: string;
  lineId: string;
  line: QuoteLineRow;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState(String(line.qty));
  const [discountPercent, setDiscountPercent] = useState(String(line.discountPercent));
  const [unitPrice, setUnitPrice] = useState((line.unitPriceCents / 100).toFixed(2));

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qty: parseInt(qty, 10) || 1,
          discountPercent: parseInt(discountPercent, 10) || 0,
          unitPriceCents: unitPrice ? Math.round(parseFloat(unitPrice) * 100) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Line updated.');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMut.mutate();
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="el-qty">Qty</Label>
          <Input
            id="el-qty"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-disc">Discount %</Label>
          <Input
            id="el-disc"
            type="number"
            min="0"
            max="100"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-price">Unit price</Label>
          <Input
            id="el-price"
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saveMut.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saveMut.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RemoveLineButton({
  quoteId,
  lineId,
  lineName,
}: {
  quoteId: string;
  lineId: string;
  lineName: string;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/lines/${lineId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success(`${lineName} removed.`);
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-slate-400 hover:text-rose-600"
      onClick={() => mut.mutate()}
      aria-label="Remove line"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

// ─── Fulfillment summary card ──────────────────────────────────────────
// Rendered inside the QuoteDetailView after the Approval timeline card.
// Guard: only shown when quote.status is FULFILLING or FULFILLED.
// For FULFILLING quotes, shows a "Run fulfillment" CTA (retry) — only
// visible to FINANCE_OPERATIONS. (Per Phase 09 task spec.)
// Note: the service currently throws ConflictError on FULFILLING re-runs,
// so clicking the CTA shows a clear error toast. The CTA is included
// for spec compliance; a full retry feature can be layered on later.

function FulfillmentSummaryCard({
  fulfillment,
  canRetry,
  onRetry,
  retrying,
  productNameById,
}: {
  fulfillment: FulfillmentOrderDetail | null;
  canRetry: boolean;
  onRetry: () => void;
  retrying: boolean;
  productNameById: Record<string, string>;
}) {
  if (!fulfillment) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-teal-600" />
            Fulfillment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-teal-600" />
            Fulfillment summary
          </CardTitle>
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={retrying}
            >
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              {retrying ? 'Retrying…' : 'Run fulfillment'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FulfillmentStat label="Status">
            <FulfillmentStatusBadge status={fulfillment.status} />
          </FulfillmentStat>
          <FulfillmentStat label="Warehouses">
            <span className="tabular-nums text-base font-semibold">
              {fulfillment.warehousesUsed}
            </span>
          </FulfillmentStat>
          <FulfillmentStat label="Fulfilled / Total">
            <span
              className={
                fulfillment.fulfilledQty === fulfillment.totalQty
                  ? 'tabular-nums text-base font-semibold text-emerald-700 dark:text-emerald-400'
                  : 'tabular-nums text-base font-semibold text-amber-700 dark:text-amber-400'
              }
            >
              {fulfillment.fulfilledQty} / {fulfillment.totalQty}
            </span>
          </FulfillmentStat>
          <FulfillmentStat label="Shipping">
            <span className="tabular-nums text-base font-semibold">
              {formatCurrency(fulfillment.shippingCostCents)}
            </span>
          </FulfillmentStat>
        </div>

        {/* Explanation */}
        {fulfillment.explanation && (
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-slate-700 dark:text-slate-300">
              {fulfillment.explanation}
            </p>
          </div>
        )}

        {/* Allocations table */}
        {fulfillment.allocations.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                <tr>
                  <th className="px-3 py-2 text-left">Warehouse</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-center">Override</th>
                </tr>
              </thead>
              <tbody>
                {fulfillment.allocations.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-slate-100 dark:border-slate-800/80"
                  >
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{a.warehouse.name}</span>
                        <span className="text-[11px] uppercase tracking-wider text-slate-500">
                          {a.warehouse.code}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {productNameById[a.productId] ?? (
                        <span className="font-mono text-xs text-slate-500">
                          {a.productId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.qty}</td>
                    <td className="px-3 py-2 text-center">
                      {a.manualOverride ? (
                        <Badge className="border-0 bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                          manual
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Backorders */}
        {fulfillment.backorders.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900/40">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/60 text-xs uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <tr>
                  <th className="px-3 py-2 text-left">Backordered product</th>
                  <th className="px-3 py-2 text-right">Short qty</th>
                </tr>
              </thead>
              <tbody>
                {fulfillment.backorders.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-amber-100 dark:border-amber-900/30"
                  >
                    <td className="px-3 py-2 text-sm">
                      {productNameById[b.productId] ?? (
                        <span className="font-mono text-xs text-slate-500">
                          {b.productId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                      {b.shortQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FulfillmentStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ─── Billing summary card ──────────────────────────────────────────
// Rendered inside the QuoteDetailView after the Fulfillment summary card.
// Guard: only shown when quote.status is FULFILLING or FULFILLED.
// Shows the invoice count, total invoiced, total paid, and recurring
// revenue (sum of active subscription priceCents × qty) for the quote.

function BillingSummaryCard({ billing }: { billing: BillingForQuote | null }) {
  if (!billing) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ReceiptText className="h-4 w-4 text-violet-600" />
            Billing summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { summary, invoices, subscriptions } = billing;
  const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ReceiptText className="h-4 w-4 text-violet-600" />
          Billing summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BillingStat label="Invoices">
            <span className="tabular-nums text-base font-semibold">
              {summary.invoiceCount}
            </span>
          </BillingStat>
          <BillingStat label="Total invoiced">
            <span className="tabular-nums text-base font-semibold">
              {formatCurrency(summary.totalInvoicedCents)}
            </span>
          </BillingStat>
          <BillingStat label="Total paid">
            <span
              className={
                summary.totalPaidCents >= summary.totalInvoicedCents && summary.totalInvoicedCents > 0
                  ? 'tabular-nums text-base font-semibold text-emerald-700 dark:text-emerald-400'
                  : 'tabular-nums text-base font-semibold'
              }
            >
              {formatCurrency(summary.totalPaidCents)}
            </span>
          </BillingStat>
          <BillingStat label="Recurring revenue">
            <span className="tabular-nums text-base font-semibold text-violet-700 dark:text-violet-400">
              {formatCurrency(summary.recurringRevenueCents)}
              <span className="ml-1 text-[11px] font-normal text-slate-500">
                /cycle
              </span>
            </span>
          </BillingStat>
        </div>

        {/* Invoices list */}
        {invoices.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                <tr>
                  <th className="px-3 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-slate-100 dark:border-slate-800/80"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-violet-700 dark:text-violet-400">
                      {inv.number}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {inv.type.replace('_', ' ').toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-xs capitalize">{inv.status.toLowerCase()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(inv.totalCents, inv.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(inv.paidCents, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Subscriptions list */}
        {activeSubs.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                <tr>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-left">Interval</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-left">Next billing</th>
                </tr>
              </thead>
              <tbody>
                {activeSubs.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-t border-slate-100 dark:border-slate-800/80"
                  >
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        {sub.plan.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {sub.interval.toLowerCase()} × {sub.intervalCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(sub.priceCents)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(sub.nextBillingDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillingStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
