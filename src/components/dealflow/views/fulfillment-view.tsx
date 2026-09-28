'use client';

// src/components/dealflow/views/fulfillment-view.tsx — The Fulfillment
// view. Lists every FulfillmentOrder across all quotes, with a side
// sheet that expands a single order to show its allocations (per
// warehouse, per product, qty, manual override flag) and backorders.
//
// RBAC reflection:
//   - The view itself is only reachable to FINANCE_OPERATIONS + ADMIN
//     (the API route enforces this).
//   - Manual overrides are restricted to FINANCE_OPERATIONS + ADMIN
//     (same). The "Override" button only renders for those roles.
//   - SALES_MANAGER / FINANCE_OPERATIONS / ADMIN can run fulfillment on
//     a confirmed quote from the QuoteDetailView.

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Truck,
  Search,
  Info,
  RefreshCw,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { FulfillmentStatusBadge } from '@/components/dealflow/badges';
import { formatCurrency } from '@/lib/money';
import { useViewStore } from '@/store/view-store';
import { useSessionStore } from '@/store/session-store';

interface FulfillmentOrderRow {
  id: string;
  quoteId: string;
  status: string;
  totalQty: number;
  fulfilledQty: number;
  shippingCostCents: number;
  warehousesUsed: number;
  explanation: string | null;
  createdAt: string;
  quote: {
    id: string;
    number: string;
    customer: { id: string; name: string; tier: string };
    owner: { id: string; name: string };
  };
  _count: { allocations: number; backorders: number };
}

interface AllocationRow {
  id: string;
  orderId: string;
  warehouseId: string;
  productId: string;
  qty: number;
  manualOverride: boolean;
  reason: string | null;
  warehouse: { id: string; name: string; code: string };
}

interface BackorderRow {
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
  allocations: AllocationRow[];
  backorders: BackorderRow[];
}

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  shippingCostCents: number;
  active: boolean;
}

export function FulfillmentView() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['fulfillment-orders', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/fulfillment?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to load fulfillment orders');
      }
      const json = await res.json();
      return json.data as FulfillmentOrderRow[];
    },
  });

  const columns: Column<FulfillmentOrderRow>[] = [
    {
      key: 'quote',
      header: 'Quote',
      render: (r) => (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setView('quote-detail', { quoteId: r.quote.id });
            }}
            className="font-mono text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {r.quote.number}
          </button>
          <span className="text-[11px] text-slate-500">
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.quote.customer.name}</span>
          <span className="text-[11px] text-slate-500">
            Owner: {r.quote.owner.name}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <FulfillmentStatusBadge status={r.status} />,
    },
    {
      key: 'warehouses',
      header: 'Warehouses',
      align: 'center',
      render: (r) => (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Truck className="h-3.5 w-3.5 text-slate-400" />
          {r.warehousesUsed}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Fulfilled / Total',
      align: 'right',
      render: (r) => (
        <span
          className={
            r.fulfilledQty === r.totalQty
              ? 'tabular-nums font-medium text-emerald-700 dark:text-emerald-400'
              : 'tabular-nums font-medium text-amber-700 dark:text-amber-400'
          }
        >
          {r.fulfilledQty} / {r.totalQty}
        </span>
      ),
    },
    {
      key: 'shipping',
      header: 'Shipping',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums">{formatCurrency(r.shippingCostCents)}</span>
      ),
    },
    {
      key: 'explanation',
      header: 'Explanation',
      render: (r) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 max-w-md">
          {r.explanation ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Fulfillment</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Multi-warehouse allocation optimizer — runs on confirmed quotes.
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
              <SelectItem value="FULFILLING">Fulfilling</SelectItem>
              <SelectItem value="FULFILLED">Fulfilled</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="BACKORDERED">Backordered</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <div className="space-y-1">
          <p className="font-medium text-emerald-900 dark:text-emerald-300">
            Deterministic multi-warehouse optimizer
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Fulfillment runs on confirmed quotes. Priority order: minimize
            warehouses used (1 {'>'} 2 {'>'} 3), then minimize shipping cost,
            then maximize fulfilled quantity. The engine evaluates every
            warehouse combination (subset size 1, 2, 3) and picks the smallest
            feasible subset. Partial fulfillments create backorders for the
            shortfall.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setOpenOrderId(r.id)}
        emptyTitle="No fulfillment orders yet"
        emptyDescription="Run fulfillment on a confirmed quote to see allocations here."
      />

      {openOrderId && (
        <OrderDetailSheet
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
          onInvalidate={() => qc.invalidateQueries({ queryKey: ['fulfillment-orders'] })}
        />
      )}
    </div>
  );
}

function OrderDetailSheet({
  orderId,
  onClose,
  onInvalidate,
}: {
  orderId: string;
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const canOverride = user?.role === 'FINANCE_OPERATIONS' || user?.role === 'ADMIN';
  const [overrideAlloc, setOverrideAlloc] = useState<AllocationRow | null>(null);

  // The list endpoint returns FulfillmentOrder rows that include the
  // quoteId. We use it to find the quoteId for the order, then fetch the
  // per-quote detail endpoint (which returns allocations + backorders).
  const { data: order, isLoading } = useQuery<FulfillmentOrderDetail | null>({
    queryKey: ['fulfillment-order', orderId],
    queryFn: async () => {
      const listRes = await fetch(`/api/fulfillment?page=1&pageSize=100`);
      const listJson = await listRes.json();
      const row = (listJson.data as FulfillmentOrderRow[]).find(
        (o) => o.id === orderId,
      );
      if (!row) return null;
      const detailRes = await fetch(`/api/quotes/${row.quoteId}/fulfillment`);
      if (!detailRes.ok) return null;
      const detailJson = await detailRes.json();
      const detail = detailJson.data as FulfillmentOrderDetail | null;
      if (detail) {
        // Stamp orderId onto each allocation so the override dialog has it
        // without us having to thread it through props.
        detail.allocations = detail.allocations.map((a) => ({
          ...a,
          orderId,
        }));
      }
      return detail;
    },
  });

  // Fetch warehouses for the override dropdown (only when needed).
  const { data: warehouses } = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses-for-override'],
    queryFn: async () => {
      const res = await fetch('/api/warehouses');
      const json = await res.json();
      return json as WarehouseRow[];
    },
    enabled: canOverride && overrideAlloc !== null,
  });

  return (
    <>
      <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Fulfillment order detail</SheetTitle>
            <SheetDescription>
              Allocations and backorders for this order. Override allocations
              to a different warehouse as needed.
            </SheetDescription>
          </SheetHeader>

          {isLoading || !order ? (
            <OrderDetailSkeleton />
          ) : (
            <div className="space-y-5 px-4 pb-6">
              {/* Summary block */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Status">
                  <FulfillmentStatusBadge status={order.status} />
                </StatTile>
                <StatTile label="Warehouses">
                  <span className="tabular-nums text-lg font-semibold">
                    {order.warehousesUsed}
                  </span>
                </StatTile>
                <StatTile label="Fulfilled / Total">
                  <span
                    className={
                      order.fulfilledQty === order.totalQty
                        ? 'tabular-nums text-lg font-semibold text-emerald-700 dark:text-emerald-400'
                        : 'tabular-nums text-lg font-semibold text-amber-700 dark:text-amber-400'
                    }
                  >
                    {order.fulfilledQty} / {order.totalQty}
                  </span>
                </StatTile>
                <StatTile label="Shipping">
                  <span className="tabular-nums text-lg font-semibold">
                    {formatCurrency(order.shippingCostCents)}
                  </span>
                </StatTile>
              </div>

              {/* Explanation */}
              {order.explanation && (
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-slate-700 dark:text-slate-300">
                    {order.explanation}
                  </p>
                </div>
              )}

              {/* Allocations */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Allocations</h3>
                {order.allocations.length === 0 ? (
                  <p className="text-xs italic text-slate-500">
                    No allocations — every line was backordered.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80">
                        <tr>
                          <th className="px-3 py-2 text-left">Warehouse</th>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-center">Override</th>
                          {canOverride && <th className="px-3 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {order.allocations.map((a) => (
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
                            <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {a.productId}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {a.qty}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {a.manualOverride ? (
                                <Badge className="border-0 bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                  manual
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            {canOverride && (
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setOverrideAlloc(a)}
                                >
                                  <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                                  Override
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {order.allocations.some((a) => a.manualOverride && a.reason) && (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {order.allocations
                      .filter((a) => a.manualOverride && a.reason)
                      .map((a) => (
                        <p key={`reason-${a.id}`}>
                          <span className="font-mono">{a.warehouse.code}</span>{' '}
                          → <span className="italic">&ldquo;{a.reason}&rdquo;</span>
                        </p>
                      ))}
                  </div>
                )}
              </section>

              {/* Backorders */}
              {order.backorders.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Backorders ({order.backorders.length})
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900/40">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50/60 text-xs uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-right">Short qty</th>
                          <th className="px-3 py-2 text-left">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.backorders.map((b) => (
                          <tr
                            key={b.id}
                            className="border-t border-amber-100 dark:border-amber-900/30"
                          >
                            <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {b.productId}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                              {b.shortQty}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {new Date(b.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {order.status === 'FULFILLED' && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  This order is fully fulfilled — no backorders outstanding.
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {overrideAlloc && (
        <OverrideDialog
          orderId={orderId}
          allocation={overrideAlloc}
          warehouses={warehouses ?? []}
          loadingWarehouses={!warehouses}
          onClose={() => setOverrideAlloc(null)}
          onSuccess={() => {
            setOverrideAlloc(null);
            onInvalidate();
          }}
        />
      )}
    </>
  );
}

function OverrideDialog({
  orderId,
  allocation,
  warehouses,
  loadingWarehouses,
  onClose,
  onSuccess,
}: {
  orderId: string;
  allocation: AllocationRow;
  warehouses: WarehouseRow[];
  loadingWarehouses: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [reason, setReason] = useState('');

  const overrideMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fulfillment/${orderId}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allocationId: allocation.id,
          newWarehouseId,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Override failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Allocation moved to the new warehouse.');
      qc.invalidateQueries({ queryKey: ['fulfillment-order'] });
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Available warehouses: exclude the current one and inactive.
  const available = warehouses.filter(
    (w) => w.id !== allocation.warehouseId && w.active,
  );

  return (
    <Dialog open={!!allocation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move allocation to a different warehouse</DialogTitle>
          <DialogDescription>
            The current warehouse will be restocked; the new warehouse will be
            decremented. A reason is required for audit.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            overrideMut.mutate();
          }}
          className="space-y-3"
        >
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span>
                From: {allocation.warehouse.name} ({allocation.warehouse.code})
              </span>
              <span className="tabular-nums">qty {allocation.qty}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-warehouse">New warehouse</Label>
            {loadingWarehouses ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={newWarehouseId} onValueChange={setNewWarehouseId}>
                <SelectTrigger id="ov-warehouse">
                  <SelectValue placeholder="Pick a warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.code}) · ship {formatCurrency(w.shippingCostCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-reason">Reason</Label>
            <Textarea
              id="ov-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Stock at WH-1 was reserved for a higher-priority order."
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                overrideMut.isPending || !newWarehouseId || !reason.trim()
              }
            >
              {overrideMut.isPending ? 'Moving…' : 'Move allocation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
