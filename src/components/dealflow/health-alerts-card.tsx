'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HeartPulse, RefreshCw, CheckCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { SeverityBadge } from '@/components/dealflow/badges';
import { useSessionStore } from '@/store/session-store';

interface HealthEventRow {
  id: string;
  quoteId: string;
  type: string;
  severity: string;
  evidence: string;
  recommendedAction: string | null;
  status: string;
  detectedAt: string;
  resolvedAt: string | null;
}

const HEALTH_ROLES = new Set(['FINANCE_OPERATIONS', 'SALES_MANAGER', 'ADMIN']);

/**
 * HealthAlertsCard — embedded in QuoteDetailView. Shows the quote's
 * DealHealthEvent rows (OPEN + ACK) with severity badge, type, evidence,
 * recommended action, and ack/resolve buttons.
 *
 * Guarded by the parent — only rendered for quotes in non-DRAFT /
 * non-CANCELLED / non-REJECTED status. The ack/resolve buttons are
 * restricted to FINANCE_OPERATIONS / SALES_MANAGER / ADMIN (the same RBAC
 * set as the underlying API endpoints).
 */
export function HealthAlertsCard({ quoteId }: { quoteId: string }) {
  const qc = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const canManage = !!user && HEALTH_ROLES.has(user.role);

  const { data, isLoading, refetch, isFetching } = useQuery<HealthEventRow[]>({
    queryKey: ['quote-health-events', quoteId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50', quoteId });
      const res = await fetch(`/api/health?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load health alerts');
      const json = await res.json();
      return (json.data ?? []) as HealthEventRow[];
    },
  });

  const runMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/health/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Health check failed');
      }
      return res.json();
    },
    onSuccess: (json) => {
      const events = json?.data?.events?.length ?? 0;
      toast.success(`Health check complete — ${events} alert(s) on this quote.`);
      qc.invalidateQueries({ queryKey: ['quote-health-events', quoteId] });
      qc.invalidateQueries({ queryKey: ['health-events-open'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ackMut = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/health/events/${eventId}/ack`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Acknowledge failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Alert acknowledged.');
      qc.invalidateQueries({ queryKey: ['quote-health-events', quoteId] });
      qc.invalidateQueries({ queryKey: ['health-events-open'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`/api/health/events/${eventId}/resolve`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Resolve failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Alert resolved.');
      qc.invalidateQueries({ queryKey: ['quote-health-events', quoteId] });
      qc.invalidateQueries({ queryKey: ['health-events-open'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Show OPEN + ACK first, RESOLVED last. Limit to the most recent 50.
  const events = (data ?? []).slice().sort((a, b) => {
    const rank = (s: string) => (s === 'OPEN' ? 0 : s === 'ACK' ? 1 : 2);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
  });

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">Health alerts</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic anomaly detection for this quote.
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Refresh health alerts"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => runMut.mutate()}
                disabled={runMut.isPending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {runMut.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <HeartPulse className="mr-2 h-4 w-4" />
                    Run health check
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No health alerts on this quote
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All detectors pass. Run the health check to refresh the scan.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {events.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {a.type.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      a.status === 'OPEN'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : a.status === 'ACK'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(a.detectedAt).toLocaleString()}
                    {a.resolvedAt ? ` · resolved ${new Date(a.resolvedAt).toLocaleString()}` : ''}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{a.evidence}</p>
                {a.recommendedAction && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">Recommended:</span> {a.recommendedAction}
                  </p>
                )}
                {canManage && a.status !== 'RESOLVED' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {a.status === 'OPEN' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ackMut.mutate(a.id)}
                        disabled={ackMut.isPending}
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMut.mutate(a.id)}
                      disabled={resolveMut.isPending}
                      className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
