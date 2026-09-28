'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import {
  RiskBandBadge,
  TierBadge,
  QuoteStatusBadge,
} from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useViewStore } from '@/store/view-store';
import { useState } from 'react';

interface ApprovalRow {
  id: string;
  requiredRole: string;
  currentStep: number;
  status: string;
  riskBand: string | null;
  riskScore: number | null;
  createdAt: string;
  quote: {
    id: string;
    number: string;
    status: string;
    totalCents: number;
    customer: { id: string; name: string; tier: string };
    owner: { id: string; name: string };
  };
}

export function ApprovalsView() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [pendingDecision, setPendingDecision] = useState<{ id: string; decision: string } | null>(null);
  const [comment, setComment] = useState('');

  const { data, isLoading } = useQuery<ApprovalRow[]>({
    queryKey: ['approval-queue'],
    queryFn: async () => {
      const res = await fetch('/api/approvals');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const decideMut = useMutation({
    mutationFn: async ({ id, decision, comment }: { id: string; decision: string; comment: string }) => {
      const res = await fetch(`/api/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Decision recorded.');
      qc.invalidateQueries({ queryKey: ['approval-queue'] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      setPendingDecision(null);
      setComment('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<ApprovalRow>[] = [
    {
      key: 'quote',
      header: 'Quote',
      render: (r) => (
        <div className="flex flex-col">
          <button
            onClick={() => setView('quote-detail', { quoteId: r.quote.id })}
            className="text-left font-mono text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {r.quote.number}
          </button>
          <span className="text-[11px] text-slate-500">
            {new Date(r.createdAt).toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{r.quote.customer.name}</span>
          <TierBadge tier={r.quote.customer.tier} />
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (r) => <span className="text-sm">{r.quote.owner.name}</span>,
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (r) =>
        r.riskBand ? (
          <div className="flex items-center gap-2">
            <RiskBandBadge band={r.riskBand} />
            <span className="text-xs tabular-nums text-slate-500">{r.riskScore}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'requiredRole',
      header: 'Your role required',
      render: (r) => (
        <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          {r.requiredRole.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.quote.totalCents)}</span>,
    },
    {
      key: 'actions',
      header: 'Decide',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            onClick={() => setPendingDecision({ id: r.id, decision: 'APPROVED' })}
          >
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            onClick={() => setPendingDecision({ id: r.id, decision: 'REJECTED' })}
          >
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
            onClick={() => setPendingDecision({ id: r.id, decision: 'RETURNED' })}
          >
            <Undo2 className="h-4 w-4" /> Return
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Approvals</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Quotes routed to you based on risk band. Self-approval is blocked.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No pending approvals"
        emptyDescription="Quotes requiring your approval will appear here."
      />

      <Dialog open={pendingDecision !== null} onOpenChange={(o) => !o && setPendingDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDecision?.decision === 'APPROVED' && 'Approve quote'}
              {pendingDecision?.decision === 'REJECTED' && 'Reject quote'}
              {pendingDecision?.decision === 'RETURNED' && 'Return for revision'}
            </DialogTitle>
            <DialogDescription>
              Add an optional comment. This will be recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment (optional)…"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDecision(null)}
            >
              Cancel
            </Button>
            <Button
              className={
                pendingDecision?.decision === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : pendingDecision?.decision === 'REJECTED'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-sky-600 hover:bg-sky-700'
              }
              disabled={decideMut.isPending}
              onClick={() => {
                if (pendingDecision) {
                  decideMut.mutate({
                    id: pendingDecision.id,
                    decision: pendingDecision.decision,
                    comment,
                  });
                }
              }}
            >
              {decideMut.isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
