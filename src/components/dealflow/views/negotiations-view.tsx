'use client';

// src/components/dealflow/views/negotiations-view.tsx — Negotiation queue
// (Phase 11).
//
// The same view is rendered for both internal roles (SALES_REP /
// SALES_MANAGER / FINANCE_OPERATIONS / ADMIN) and the CUSTOMER role. The
// underlying API (`GET /api/negotiations`) auto-scopes by role:
//   - CUSTOMER  → only their own organization's negotiations; internal
//                 comments are filtered out server-side; the safe customer
//                 message is returned for each row.
//   - SALES_REP → negotiations for quotes they own or that belong to their
//                 assigned customers.
//   - MANAGER / FINANCE / ADMIN → all.
//
// UI differences by role:
//   - Internal roles see a "Negotiation queue" header, a search box, a
//     status filter, and the changes table + comments thread in the side
//     Sheet. MANAGER / FINANCE / ADMIN get Accept / Reject buttons; SALES_REP
//     sees the queue (read-only for the decision buttons — the API will
//     reject the call anyway).
//   - CUSTOMER sees a "My proposals" header and a personalized DataTable.
//     The side Sheet shows the customer's proposal history + the safe
//     status message + the customer-visible comments + an "Add a message"
//     form (internal comments are blocked server-side).
//
// RBAC reflection on Accept / Reject buttons:
//   - SALES_MANAGER / FINANCE_OPERATIONS / ADMIN can accept or reject.
//   - SALES_REP and CUSTOMER cannot (buttons are not rendered).

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  RefreshCw,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import {
  NegotiationStatusBadge,
  QuoteStatusBadge,
  RiskBandBadge,
  TierBadge,
} from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useViewStore } from '@/store/view-store';
import { useSessionStore } from '@/store/session-store';
import type { Role } from '@/store/session-store';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface NegotiationChangeRow {
  id: string;
  quoteLineId: string | null;
  field: string;
  oldValue: string;
  newValue: string;
  newRiskScore: number | null;
  newRiskBand: string | null;
  invalidatesApproval: boolean;
  createdAt: string;
}

interface NegotiationCommentRow {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  internal: boolean;
  createdAt: string;
}

interface NegotiationRow {
  id: string;
  quoteId: string;
  customerId: string;
  status: string;
  message: string | null;
  customerSafeMessage: string | null;
  invalidatesApproval: boolean;
  newRiskScore: number | null;
  newRiskBand: string | null;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  changes: NegotiationChangeRow[];
  comments: NegotiationCommentRow[];
  quote?: {
    id: string;
    number: string;
    status: string;
    customer: { id: string; name: string; tier: string };
    owner: { id: string; name: string };
  } | null;
}

// ──────────────────────────────────────────────────────────────────────
// Top-level component — branch by role
// ──────────────────────────────────────────────────────────────────────

export function NegotiationsView() {
  const user = useSessionStore((s) => s.user);
  const isCustomer = user?.role === 'CUSTOMER';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<NegotiationRow[]>({
    queryKey: ['negotiations', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/negotiations?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load negotiations');
      }
      const json = await res.json();
      let rows = (json.data ?? []) as NegotiationRow[];
      // Client-side search filter on quote number (matches the server-side
      // search behavior on other lists; the negotiations endpoint doesn't
      // implement search because it would need a join through Quote).
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter((r) => r.quote?.number?.toLowerCase().includes(q));
      }
      return rows;
    },
  });

  const columns = isCustomer ? customerColumns() : internalColumns();

  function internalColumns(): Column<NegotiationRow>[] {
    return [
      {
        key: 'quote',
        header: 'Quote',
        render: (r) =>
          r.quote ? (
            <div className="flex flex-col">
              <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {r.quote.number}
              </span>
              <span className="text-[11px] text-slate-500">
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'customer',
        header: 'Customer',
        render: (r) =>
          r.quote ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium">{r.quote.customer.name}</span>
              <TierBadge tier={r.quote.customer.tier} />
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <NegotiationStatusBadge status={r.status} />,
      },
      {
        key: 'changes',
        header: 'Changes',
        align: 'center',
        render: (r) => (
          <span className="tabular-nums">{r.changes.length}</span>
        ),
      },
      {
        key: 'invalidates',
        header: 'Re-approval',
        align: 'center',
        render: (r) =>
          r.invalidatesApproval ? (
            <Badge className="border-0 bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Required
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'risk',
        header: 'Risk if applied',
        render: (r) =>
          r.newRiskBand ? (
            <div className="flex items-center gap-2">
              <RiskBandBadge band={r.newRiskBand} />
              <span className="text-xs tabular-nums text-slate-500">
                {r.newRiskScore ?? '—'}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'created',
        header: 'Opened',
        align: 'right',
        render: (r) => (
          <span className="text-xs text-slate-500">
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ];
  }

  function customerColumns(): Column<NegotiationRow>[] {
    return [
      {
        key: 'quote',
        header: 'Quote',
        render: (r) =>
          r.quote ? (
            <div className="flex flex-col">
              <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {r.quote.number}
              </span>
              <span className="text-[11px] text-slate-500">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <NegotiationStatusBadge status={r.status} />,
      },
      {
        key: 'changes',
        header: 'Changes',
        align: 'center',
        render: (r) => (
          <span className="tabular-nums">{r.changes.length}</span>
        ),
      },
      {
        key: 'message',
        header: 'Response',
        render: (r) => (
          <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 max-w-sm">
            {r.customerSafeMessage ?? '—'}
          </span>
        ),
      },
      {
        key: 'created',
        header: 'Opened',
        align: 'right',
        render: (r) => (
          <span className="text-xs text-slate-500">
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ];
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {isCustomer ? 'My proposals' : 'Negotiations'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isCustomer
              ? 'See the status of your counter-offers and continue the conversation with our team.'
              : 'Customer counter-offers. Accept applies the change and re-routes approval if the risk band escalates.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by quote number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="SUPERSEDED">Superseded</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isCustomer && (
        <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-900/40 dark:bg-sky-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
          <div className="space-y-1">
            <p className="font-medium text-sky-900 dark:text-sky-300">
              Your proposals
            </p>
            <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
              Each proposal is reviewed by our team. If your change requires
              additional approval, we&apos;ll route it through the right
              workflow and update the status here.
            </p>
          </div>
        </div>
      )}

      {!isCustomer && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-300">
              Negotiation queue
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              Each row is a customer counter-offer with one or more requested
              changes. The &ldquo;Risk if applied&rdquo; column is the worst-case
              simulated risk score if the proposal is accepted. If accepting
              the proposal escalates the risk band, the existing approval is
              invalidated and the quote is re-routed to a new approval chain.
            </p>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle={isCustomer ? 'No proposals yet' : 'No negotiation requests'}
        emptyDescription={
          isCustomer
            ? 'Propose changes on a quote to start a negotiation with our team.'
            : 'Customer counter-offers will appear here once they submit proposals.'
        }
      />

      {openId && (
        <NegotiationSheet
          requestId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Side Sheet — changes + comments + (for managers) Accept / Reject
// ──────────────────────────────────────────────────────────────────────

function NegotiationSheet({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const setView = useViewStore((s) => s.setView);
  const isCustomer = user?.role === 'CUSTOMER';
  const canDecide =
    user?.role === 'SALES_MANAGER' ||
    user?.role === 'FINANCE_OPERATIONS' ||
    user?.role === 'ADMIN';

  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptComment, setAcceptComment] = useState('');

  const { data: detail, isLoading } = useQuery<NegotiationRow>({
    queryKey: ['negotiation', requestId],
    queryFn: async () => {
      const res = await fetch(`/api/negotiations/${requestId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load negotiation');
      }
      const json = await res.json();
      return json.data as NegotiationRow;
    },
  });

  const acceptMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/negotiations/${requestId}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comment: acceptComment || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to accept proposal');
      return json.data;
    },
    onSuccess: () => {
      toast.success('Proposal accepted. Quote updated.');
      setAcceptOpen(false);
      setAcceptComment('');
      qc.invalidateQueries({ queryKey: ['negotiation', requestId] });
      qc.invalidateQueries({ queryKey: ['negotiations'] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/negotiations/${requestId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to reject proposal');
      return json.data;
    },
    onSuccess: () => {
      toast.success('Proposal rejected.');
      setRejectOpen(false);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['negotiation', requestId] });
      qc.invalidateQueries({ queryKey: ['negotiations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commentMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/negotiations/${requestId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: commentBody, internal: commentInternal }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to add comment');
      return json.data;
    },
    onSuccess: () => {
      toast.success('Comment added.');
      setCommentBody('');
      setCommentInternal(false);
      qc.invalidateQueries({ queryKey: ['negotiation', requestId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {detail?.quote ? `Negotiation · ${detail.quote.number}` : 'Negotiation'}
          </SheetTitle>
          <SheetDescription>
            {detail && detail.quote
              ? `Customer ${detail.quote.customer.name} requested ${detail.changes.length} change${detail.changes.length === 1 ? '' : 's'}.`
              : 'Loading negotiation detail…'}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !detail ? (
          <SheetSkeleton />
        ) : (
          <div className="space-y-5 px-4 pb-6">
            {/* Status block */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Status">
                <NegotiationStatusBadge status={detail.status} />
              </StatTile>
              <StatTile label="Re-approval">
                {detail.invalidatesApproval ? (
                  <Badge className="border-0 bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Required
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400">Not required</span>
                )}
              </StatTile>
              {/* Internal-only: the simulated risk band is a manager-only
                  indicator. Customers see the "Re-approval" tile and the
                  safe customer-facing message instead — they never see the
                  raw risk score / band. */}
              {!isCustomer && detail.newRiskBand && (
                <StatTile label="Risk if applied">
                  <div className="flex items-center gap-2">
                    <RiskBandBadge band={detail.newRiskBand} />
                    <span className="text-xs tabular-nums text-slate-500">
                      {detail.newRiskScore ?? '—'}
                    </span>
                  </div>
                </StatTile>
              )}
              <StatTile label="Opened">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {new Date(detail.createdAt).toLocaleDateString()}
                </span>
              </StatTile>
            </div>

            {/* Customer's message */}
            {detail.message && (
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
                  Customer message
                </p>
                <p className="text-slate-700 dark:text-slate-300">{detail.message}</p>
              </div>
            )}

            {/* Customer-facing safe message (always shown to customer; shown
                to internal as a reminder of what the customer saw). */}
            {detail.customerSafeMessage && (
              <div
                className={
                  isCustomer
                    ? 'flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300'
                }
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">
                    {isCustomer ? 'Status update' : 'Customer-facing message'}
                  </p>
                  <p className="mt-1">{detail.customerSafeMessage}</p>
                </div>
              </div>
            )}

            {/* Quote link (internal roles only — customers use the portal) */}
            {!isCustomer && detail.quote && (
              <button
                type="button"
                onClick={() => setView('quote-detail', { quoteId: detail.quote!.id })}
                className="text-left text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Open quote {detail.quote.number} ({detail.quote.customer.name}) →
              </button>
            )}

            {/* Changes table */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Requested changes</h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                    <tr>
                      <th className="px-3 py-2 text-left">Field</th>
                      <th className="px-3 py-2 text-right">From</th>
                      <th className="px-3 py-2 text-right">To</th>
                      {!isCustomer && (
                        <>
                          <th className="px-3 py-2 text-right">Sim. risk</th>
                          <th className="px-3 py-2 text-center">Re-approve</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.changes.map((c) => (
                      <tr
                        key={c.id}
                        className="border-t border-slate-100 dark:border-slate-800/80"
                      >
                        <td className="px-3 py-2 font-medium">
                          {c.field === 'discountPercent' ? 'Discount %' : 'Quantity'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {c.oldValue}
                          {c.field === 'discountPercent' ? '%' : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {c.newValue}
                          {c.field === 'discountPercent' ? '%' : ''}
                        </td>
                        {!isCustomer && (
                          <>
                            <td className="px-3 py-2 text-right">
                              {c.newRiskBand ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <RiskBandBadge band={c.newRiskBand} />
                                  <span className="text-xs tabular-nums text-slate-500">
                                    {c.newRiskScore ?? '—'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.invalidatesApproval ? (
                                <Badge className="border-0 bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                  Yes
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Comments thread */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Conversation</h3>
              {detail.comments.length === 0 ? (
                <p className="text-xs italic text-slate-500">
                  No comments yet. Start the conversation below.
                </p>
              ) : (
                <ol className="space-y-2">
                  {detail.comments.map((c) => (
                    <li
                      key={c.id}
                      className={
                        c.internal
                          ? 'rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30'
                          : 'rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900'
                      }
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{c.authorName}</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-500">
                            {formatRoleLabel(c.authorRole)}
                          </span>
                          {c.internal && (
                            <Badge className="border-0 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              <Lock className="mr-1 h-3 w-3" />
                              internal
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {new Date(c.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{c.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Add-comment form */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Add a comment</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!commentBody.trim()) return;
                  commentMut.mutate();
                }}
                className="space-y-2"
              >
                <Textarea
                  rows={2}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Type a message…"
                  maxLength={2000}
                />
                {!isCustomer && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      id="nc-internal"
                      type="checkbox"
                      checked={commentInternal}
                      onChange={(e) => setCommentInternal(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    <Label htmlFor="nc-internal" className="cursor-pointer text-xs">
                      Mark as internal (customers will not see this comment)
                    </Label>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={commentMut.isPending || !commentBody.trim()}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    {commentMut.isPending ? 'Posting…' : 'Add comment'}
                  </Button>
                </div>
              </form>
            </section>

            {/* Accept / Reject (MANAGER / FINANCE / ADMIN only) */}
            {canDecide && detail.status === 'OPEN' && !acceptOpen && !rejectOpen && (
              <section className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setAcceptOpen(true)}
                  disabled={acceptMut.isPending || rejectMut.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept proposal
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => setRejectOpen(true)}
                  disabled={acceptMut.isPending || rejectMut.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <p className="w-full text-[11px] text-slate-500">
                  Accept applies the changes to the quote, recomputes risk, and
                  {detail.invalidatesApproval
                    ? ' invalidates the existing approval + re-routes to a new approval chain.'
                    : ' leaves the existing approval in place.'}
                </p>
              </section>
            )}

            {/* Accept confirmation */}
            {acceptOpen && (
              <Card className="border-emerald-200 dark:border-emerald-900/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        Accept this proposal?
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        The proposed changes will be applied to the quote. The
                        risk band will be recomputed and{' '}
                        {detail.invalidatesApproval
                          ? 'the existing approval will be invalidated and re-routed.'
                          : 'the existing approval will be left in place.'}
                      </p>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    value={acceptComment}
                    onChange={(e) => setAcceptComment(e.target.value)}
                    placeholder="Optional comment (visible to the customer)…"
                    maxLength={2000}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAcceptOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => acceptMut.mutate()}
                      disabled={acceptMut.isPending}
                    >
                      {acceptMut.isPending ? 'Accepting…' : 'Confirm accept'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reject confirmation */}
            {rejectOpen && (
              <Card className="border-rose-200 dark:border-rose-900/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                        Reject this proposal?
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        The customer will be notified. A reason is required and
                        will be visible in the conversation thread.
                      </p>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (required)…"
                    maxLength={2000}
                    required
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRejectOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-rose-600 hover:bg-rose-700"
                      onClick={() => {
                        if (!rejectReason.trim()) {
                          toast.error('A reason is required to reject.');
                          return;
                        }
                        rejectMut.mutate();
                      }}
                      disabled={rejectMut.isPending}
                    >
                      {rejectMut.isPending ? 'Rejecting…' : 'Confirm reject'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resolved banner */}
            {detail.status !== 'OPEN' && (
              <div
                className={
                  detail.status === 'ACCEPTED'
                    ? 'flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300'
                }
              >
                {detail.status === 'ACCEPTED' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                This proposal was {detail.status.toLowerCase()} on{' '}
                {detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString() : ''}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
