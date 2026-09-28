'use client';

import { useState, useMemo } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Search, LayoutGrid, Table2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import {
  QuoteStatusBadge,
  RiskBandBadge,
  TierBadge,
} from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useViewStore } from '@/store/view-store';
import { cn } from '@/lib/utils';

interface QuoteRow {
  id: string;
  number: string;
  status: string;
  revision: number;
  totalCents: number;
  riskBand: string | null;
  riskScore: number | null;
  customer: { id: string; name: string; tier: string };
  owner: { id: string; name: string };
  createdAt: string;
}

interface CustomerRow {
  id: string;
  name: string;
  tier: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Kanban column definitions — map our internal statuses to the 5 visual
// columns shown in the reference screenshot (Draft / Pending Approval /
// Approved / Negotiation / Confirmed).
// ────────────────────────────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  label: string;
  statuses: string[];
  accent: string; // tailwind gradient classes for the column header bar
  badge: string; // column header pill bg
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'draft',
    label: 'Draft',
    statuses: ['DRAFT', 'RETURNED'],
    accent: 'from-slate-400 to-slate-500',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    id: 'pending',
    label: 'Pending Approval',
    statuses: ['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'],
    accent: 'from-amber-400 to-orange-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  {
    id: 'approved',
    label: 'Approved',
    statuses: ['APPROVED'],
    accent: 'from-emerald-400 to-teal-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    statuses: ['FULFILLING', 'FULFILLED'],
    accent: 'from-violet-400 to-fuchsia-500',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    statuses: ['CONFIRMED'],
    accent: 'from-sky-400 to-cyan-500',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  },
];

// Quotes that don't match any column (REJECTED, CANCELLED) are hidden in
// the Kanban view — they still show in the table view via the status filter.

export function QuotesView() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [openCreate, setOpenCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '200' });
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/quotes?${params.toString()}`);
      const json = await res.json();
      return json.data as QuoteRow[];
    },
  });

  const { data: customers } = useQuery<CustomerRow[]>({
    queryKey: ['customers-for-quote'],
    queryFn: async () => {
      const res = await fetch('/api/customers?page=1&pageSize=100');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create quote');
      }
      return res.json();
    },
    onSuccess: (quote) => {
      toast.success(`Quote ${quote.number} created.`);
      qc.invalidateQueries({ queryKey: ['quotes'] });
      setOpenCreate(false);
      setView('quote-detail', { quoteId: quote.id });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group quotes into Kanban columns.
  const kanbanData = useMemo(() => {
    const all = data ?? [];
    return KANBAN_COLUMNS.map((col) => ({
      column: col,
      quotes: all
        .filter((q) => col.statuses.includes(q.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));
  }, [data]);

  const tableColumns: Column<QuoteRow>[] = [
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
      key: 'owner',
      header: 'Owner',
      render: (r) => <span className="text-sm">{r.owner.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <QuoteStatusBadge status={r.status} />,
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
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => <span className="font-medium tabular-nums">{formatCurrency(r.totalCents)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Quotations List</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every quotation has a status. Click a card to open, view, or edit it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'kanban'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
              aria-label="Board view"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'table'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
              aria-label="Table view"
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>

          {viewMode === 'table' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by number…"
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
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="PENDING_MANAGER">Pending Manager</SelectItem>
                  <SelectItem value="PENDING_FINANCE">Pending Finance</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Quotation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create quote</DialogTitle>
                <DialogDescription>
                  Choose a customer to start a draft. Lines are added next.
                </DialogDescription>
              </DialogHeader>
              <CreateQuoteForm
                customers={customers ?? []}
                onSubmit={(v) => createMut.mutate(v)}
                submitting={createMut.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanBoard
          columns={kanbanData}
          isLoading={isLoading}
          onQuoteClick={(q) => setView('quote-detail', { quoteId: q.id })}
        />
      ) : (
        <DataTable
          columns={tableColumns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => setView('quote-detail', { quoteId: r.id })}
          emptyTitle="No quotes yet"
          emptyDescription="Create your first quote to start the deal lifecycle."
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Kanban Board — 5 vertical columns by status.
// ────────────────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  columns: { column: KanbanColumn; quotes: QuoteRow[] }[];
  isLoading: boolean;
  onQuoteClick: (q: QuoteRow) => void;
}

function KanbanBoard({ columns, isLoading, onQuoteClick }: KanbanBoardProps) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max gap-4">
        {columns.map(({ column, quotes }) => (
          <div key={column.id} className="flex w-72 shrink-0 flex-col">
            {/* Column header */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={cn('h-2.5 w-2.5 rounded-full bg-gradient-to-br', column.accent)} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {column.label}
                </span>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums', column.badge)}>
                {quotes.length}
              </span>
            </div>

            {/* Column body */}
            <div className="flex flex-1 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                </div>
              ) : quotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200/60 text-slate-400 dark:bg-slate-800">
                    <Plus className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] text-slate-400">No quotes here</p>
                </div>
              ) : (
                quotes.map((q) => (
                  <KanbanCard key={q.id} quote={q} onClick={() => onQuoteClick(q)} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Kanban Card — one quote, shown as a draggable-looking card.
// ────────────────────────────────────────────────────────────────────────────

function KanbanCard({ quote, onClick }: { quote: QuoteRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-700',
      )}
    >
      {/* Gradient accent bar at the top */}
      <div className={cn(
        'absolute inset-x-0 top-0 h-0.5 opacity-60 transition-opacity group-hover:opacity-100',
        quote.status === 'DRAFT' || quote.status === 'RETURNED' ? 'bg-slate-400' :
        quote.status === 'SUBMITTED' || quote.status === 'PENDING_MANAGER' || quote.status === 'PENDING_FINANCE' ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
        quote.status === 'APPROVED' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
        quote.status === 'CONFIRMED' ? 'bg-gradient-to-r from-sky-400 to-cyan-500' :
        'bg-gradient-to-r from-violet-400 to-fuchsia-500',
      )} />
      {/* Card body */}
      <div className="space-y-2 pt-1">
        {/* Top row: quote number + risk badge */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            {quote.number}
          </span>
          {quote.riskBand && quote.riskBand !== 'SAFE' && (
            <RiskBandBadge band={quote.riskBand} />
          )}
        </div>
        {/* Customer name */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {quote.customer.name}
          </span>
          <TierBadge tier={quote.customer.tier} />
        </div>
        {/* Total + owner */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(quote.totalCents)}
          </span>
          <span className="text-[10px] text-slate-500">{quote.owner.name}</span>
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Create Quote form (unchanged)
// ────────────────────────────────────────────────────────────────────────────

function CreateQuoteForm({
  customers,
  onSubmit,
  submitting,
}: {
  customers: CustomerRow[];
  onSubmit: (v: Record<string, unknown>) => void;
  submitting?: boolean;
}) {
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [taxPercent, setTaxPercent] = useState('0');
  const [notes, setNotes] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          customerId,
          currency,
          taxPercent: parseInt(taxPercent, 10) || 0,
          notes: notes || undefined,
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="q-customer">Customer</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger id="q-customer">
            <SelectValue placeholder="Pick a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {c.tier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="q-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="q-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">₹ INR</SelectItem>
              <SelectItem value="USD">$ USD</SelectItem>
              <SelectItem value="EUR">€ EUR</SelectItem>
              <SelectItem value="GBP">£ GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-tax">Tax %</Label>
          <Input
            id="q-tax"
            type="number"
            min="0"
            max="100"
            value={taxPercent}
            onChange={(e) => setTaxPercent(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-notes">Notes (optional)</Label>
        <Input
          id="q-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting || !customerId}>
          {submitting ? 'Creating…' : 'Create quote'}
        </Button>
      </DialogFooter>
    </form>
  );
}
