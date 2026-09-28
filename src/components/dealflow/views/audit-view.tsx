'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditEventRow {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  quoteId: string | null;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: string;
}

interface AuditStats {
  since: string;
  byEntityType: { type: string; count: number }[];
  byAction: { action: string; count: number }[];
  byActor: {
    actorId: string | null;
    actorName: string | null;
    actorRole: string | null;
    count: number;
  }[];
}

const ENTITY_TONES: Record<string, string> = {
  quote: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  customer: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  product: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  approval: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  fulfillment: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  billing: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
  negotiation: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  healthEvent: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  discountRule: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
  riskConfig: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  warehouse: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
};

export function AuditView() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-events', search, entityType, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (search) params.set('action', search);
      if (entityType !== 'ALL') params.set('entityType', entityType);
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load audit trail');
      return res.json();
    },
  });

  const { data: stats } = useQuery<AuditStats>({
    queryKey: ['audit-stats'],
    queryFn: async () => (await fetch('/api/audit/stats')).json(),
    refetchInterval: 30_000,
  });

  const events = (data?.data ?? []) as AuditEventRow[];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Audit Trail</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Immutable, append-only log of every business action across DealFlow360.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Events by entity (last 7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-2">
            {(stats?.byEntityType ?? []).slice(0, 8).map((e) => (
              <div key={e.type} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      ENTITY_TONES[e.type] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {e.type}
                  </span>
                </span>
                <span className="tabular-nums font-medium">{e.count}</span>
              </div>
            ))}
            {!stats?.byEntityType?.length && (
              <p className="text-xs text-slate-400">No events recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Top actions (last 7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-2">
            {(stats?.byAction ?? []).slice(0, 8).map((a) => (
              <div key={a.action} className="flex items-center justify-between text-sm">
                <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                  {a.action}
                </span>
                <span className="tabular-nums font-medium">{a.count}</span>
              </div>
            ))}
            {!stats?.byAction?.length && (
              <p className="text-xs text-slate-400">No actions recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Top actors (last 7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-2">
            {(stats?.byActor ?? []).slice(0, 8).map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate font-medium">{a.actorName ?? 'system'}</span>
                  {a.actorRole && (
                    <span className="text-[10px] uppercase text-slate-500">
                      {a.actorRole.replace('_', ' ')}
                    </span>
                  )}
                </span>
                <span className="tabular-nums font-medium">{a.count}</span>
              </div>
            ))}
            {!stats?.byActor?.length && (
              <p className="text-xs text-slate-400">No actors recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by action (e.g. quote.submit, approval.approve)…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={entityType}
          onValueChange={(v) => {
            setEntityType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All entities</SelectItem>
            <SelectItem value="quote">Quote</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="approval">Approval</SelectItem>
            <SelectItem value="fulfillment">Fulfillment</SelectItem>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="negotiation">Negotiation</SelectItem>
            <SelectItem value="healthEvent">Health</SelectItem>
            <SelectItem value="discountRule">Discount rule</SelectItem>
            <SelectItem value="warehouse">Warehouse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4" /> Timeline
            <Badge variant="secondary" className="ml-2 tabular-nums">
              {data?.total ?? 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[600px] pr-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <ScrollText className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No audit events match your filters
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Try clearing the search or selecting a different entity type.
                </p>
              </div>
            ) : (
              <ol className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="mt-0.5 flex flex-col items-center">
                      <div
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold uppercase',
                          ENTITY_TONES[ev.entityType] ??
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                        )}
                      >
                        {ev.entityType[0]}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ev.action}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                            ENTITY_TONES[ev.entityType] ??
                              'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {ev.entityType}
                        </span>
                        {ev.entityId && (
                          <span className="font-mono text-[10px] text-slate-500">
                            {ev.entityId.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          by{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {ev.actorName ?? 'system'}
                          </span>
                          {ev.actorRole && (
                            <span className="ml-1 text-[10px] uppercase">
                              {ev.actorRole.replace('_', ' ')}
                            </span>
                          )}
                        </span>
                        <span>·</span>
                        <span>{new Date(ev.createdAt).toLocaleString()}</span>
                        {ev.reason && (
                          <>
                            <span>·</span>
                            <span className="italic">"{ev.reason}"</span>
                          </>
                        )}
                      </div>
                      {(ev.oldValue || ev.newValue) && (
                        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {ev.oldValue && (
                            <div className="rounded bg-rose-50 px-2 py-1 text-[11px] dark:bg-rose-950/20">
                              <span className="font-semibold text-rose-700 dark:text-rose-400">
                                old:
                              </span>{' '}
                              <code className="break-all text-slate-700 dark:text-slate-300">
                                {truncate(ev.oldValue)}
                              </code>
                            </div>
                          )}
                          {ev.newValue && (
                            <div className="rounded bg-emerald-50 px-2 py-1 text-[11px] dark:bg-emerald-950/20">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                new:
                              </span>{' '}
                              <code className="break-all text-slate-700 dark:text-slate-300">
                                {truncate(ev.newValue)}
                              </code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </ScrollArea>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Page {data.page} of {data.totalPages} · {data.total} total events
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-800"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-800"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function truncate(s: string, max = 240): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
