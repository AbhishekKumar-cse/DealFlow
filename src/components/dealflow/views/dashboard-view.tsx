'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCheck,
  CheckCircle2,
  DollarSign,
  FileText,
  HeartPulse,
  type LucideIcon,
  RefreshCw,
  Repeat,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useSessionStore } from '@/store/session-store';
import { useViewStore } from '@/store/view-store';
import { SeverityBadge, QuoteStatusBadge } from '@/components/dealflow/badges';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { formatCurrency } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  ApprovalAgingChart,
  DiscountDistributionChart,
  FulfillmentStateChart,
  PipelineByStageChart,
  RevenueMixChart,
  RiskDistributionChart,
} from '@/components/dealflow/dashboard-charts';

// ────────────────────────────────────────────────────────────────────────────
// Tone palette — no indigo / blue (per styling rules).
// ────────────────────────────────────────────────────────────────────────────

const TONE_MAP: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  lime: 'bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-400',
};

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface DashboardKpisDto {
  pipelineValue: number;
  openQuotes: number;
  pendingApprovals: number;
  atRiskDeals: number;
  projectedMarginPct: number;
  avgDiscountPct: number;
  fulfillmentIssues: number;
  mrr: number;
}

interface DashboardChartsDto {
  pipelineByStage: { stage: string; count: number }[];
  riskDistribution: { band: string; count: number }[];
  approvalAging: { bucket: string; count: number }[];
  discountDistribution: { bucket: string; count: number }[];
  fulfillmentState: { status: string; count: number }[];
  revenueMix: { recurring: number; oneTime: number };
}

interface MetricsResponse {
  kpis: DashboardKpisDto;
  charts: DashboardChartsDto;
}

interface CustomerQuoteRow {
  id: string;
  number: string;
  status: string;
  revision: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

interface HealthEventRow {
  id: string;
  quoteId: string;
  type: string;
  severity: string;
  evidence: string;
  recommendedAction: string | null;
  status: string;
  detectedAt: string;
  quote?: {
    id: string;
    number: string;
    status: string;
    customer: { id: string; name: string; tier: string };
    owner: { id: string; name: string };
  } | null;
}

const HEALTH_ROLES = new Set(['FINANCE_OPERATIONS', 'SALES_MANAGER', 'ADMIN']);

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: keyof typeof TONE_MAP;
  /** Optional delta/sub-text shown below the value. */
  subtext?: string;
  /** Optional trend indicator: 'up' | 'down' | 'flat'. */
  trend?: 'up' | 'down' | 'flat';
}

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingUp,
  flat: Activity,
};

function KpiCard({ label, value, icon: Icon, tone, subtext, trend }: KpiCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-slate-200 transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50',
        'dark:border-slate-800 dark:hover:shadow-black/30',
      )}
    >
      {/* Gradient accent bar at the top */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100',
          TONE_BAR[tone],
        )}
      />
      <CardContent className="flex items-center justify-between p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {value}
          </span>
          {subtext && (
            <span
              className={cn(
                'flex items-center gap-1 text-[11px] font-medium',
                trend === 'up' && 'text-emerald-600 dark:text-emerald-400',
                trend === 'down' && 'text-rose-600 dark:text-rose-400',
                (!trend || trend === 'flat') && 'text-slate-500 dark:text-slate-400',
              )}
            >
              {trend && trend !== 'flat' && (() => {
                const TrendIcon = TREND_ICON[trend];
                return <TrendIcon className={cn('h-3 w-3', trend === 'down' && 'rotate-180')} />;
              })()}
              {subtext}
            </span>
          )}
        </div>
        <div
          className={cn(
            'grid h-10 w-10 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110',
            TONE_MAP[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// Gradient bar accents per tone (top of each KPI card).
const TONE_BAR: Record<string, string> = {
  emerald: 'bg-gradient-to-r from-emerald-400 to-teal-500',
  teal: 'bg-gradient-to-r from-teal-400 to-cyan-500',
  amber: 'bg-gradient-to-r from-amber-400 to-orange-500',
  rose: 'bg-gradient-to-r from-rose-400 to-pink-500',
  violet: 'bg-gradient-to-r from-violet-400 to-purple-500',
  fuchsia: 'bg-gradient-to-r from-fuchsia-400 to-pink-500',
  orange: 'bg-gradient-to-r from-orange-400 to-red-500',
  lime: 'bg-gradient-to-r from-lime-400 to-green-500',
};

// ────────────────────────────────────────────────────────────────────────────
// Dashboard view
// ────────────────────────────────────────────────────────────────────────────

export function DashboardView() {
  const user = useSessionStore((s) => s.user);
  const isCustomer = user?.role === 'CUSTOMER';
  const canSeeHealth = !!user && HEALTH_ROLES.has(user.role);

  return (
    <div className="space-y-6">
      {/* Hero banner with gradient */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/30 p-6 dark:border-slate-800 dark:from-slate-900 dark:via-emerald-950/20 dark:to-teal-950/10">
        {/* Decorative blurred blobs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10" />
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              DealFlow360
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isCustomer ? 'Customer Portal' : 'Executive Overview'}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome back, {user?.name?.split(' ')[0] ?? 'there'}.
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {isCustomer
              ? 'A live overview of your organization\u2019s activity with us.'
              : 'Live executive overview of your deal pipeline, risks, and revenue.'}
          </p>
        </div>
      </div>

      <DashboardMetricsSection isCustomer={isCustomer} />

      {canSeeHealth && <HealthAlertsPanel />}

      {isCustomer && <CustomerQuotesSummary />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI grid + chart grid (internal roles) / KPI grid only (CUSTOMER)
// ────────────────────────────────────────────────────────────────────────────

function DashboardMetricsSection({ isCustomer }: { isCustomer: boolean }) {
  const { data, isLoading } = useQuery<MetricsResponse>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/metrics');
      if (!res.ok) throw new Error('Failed to load dashboard metrics');
      return res.json();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: isCustomer ? 4 : 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        {!isCustomer && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const k = data.kpis;
  const c = data.charts;

  // Role-aware KPI list.
  const kpiCards: KpiCardProps[] = isCustomer
    ? [
        {
          label: 'Pipeline Value',
          value: formatCurrency(k.pipelineValue),
          icon: DollarSign,
          tone: 'emerald',
        },
        {
          label: 'Open Quotes',
          value: String(k.openQuotes),
          icon: FileText,
          tone: 'teal',
        },
        {
          label: 'Avg. Discount',
          value: `${k.avgDiscountPct.toFixed(1)}%`,
          icon: Activity,
          tone: 'fuchsia',
        },
        {
          label: 'Recurring Revenue',
          value: formatCurrency(k.mrr),
          icon: Repeat,
          tone: 'lime',
        },
      ]
    : [
        {
          label: 'Pipeline Value',
          value: formatCurrency(k.pipelineValue),
          icon: DollarSign,
          tone: 'emerald',
        },
        {
          label: 'Open Quotes',
          value: String(k.openQuotes),
          icon: FileText,
          tone: 'teal',
        },
        {
          label: 'Pending Approvals',
          value: String(k.pendingApprovals),
          icon: CheckCircle2,
          tone: 'amber',
        },
        {
          label: 'At-Risk Deals',
          value: String(k.atRiskDeals),
          icon: AlertTriangle,
          tone: 'rose',
        },
        {
          label: 'Projected Margin',
          value: `${k.projectedMarginPct.toFixed(1)}%`,
          icon: TrendingUp,
          tone: 'violet',
        },
        {
          label: 'Avg. Discount',
          value: `${k.avgDiscountPct.toFixed(1)}%`,
          icon: Activity,
          tone: 'fuchsia',
        },
        {
          label: 'Fulfillment Issues',
          value: String(k.fulfillmentIssues),
          icon: Truck,
          tone: 'orange',
        },
        {
          label: 'Recurring Revenue',
          value: formatCurrency(k.mrr),
          icon: Repeat,
          tone: 'lime',
        },
      ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {!isCustomer && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PipelineByStageChart data={c.pipelineByStage} />
          <RiskDistributionChart data={c.riskDistribution} />
          <ApprovalAgingChart data={c.approvalAging} />
          <DiscountDistributionChart data={c.discountDistribution} />
          <FulfillmentStateChart data={c.fulfillmentState} />
          <RevenueMixChart data={c.revenueMix} />
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Customer-facing "Your recent quotes" summary
// ────────────────────────────────────────────────────────────────────────────

function CustomerQuotesSummary() {
  const setView = useViewStore((s) => s.setView);
  const { data, isLoading } = useQuery<CustomerQuoteRow[]>({
    queryKey: ['dashboard-customer-quotes'],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '10' });
      const res = await fetch(`/api/quotes?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load quotes');
      const json = await res.json();
      return (json.data ?? []) as CustomerQuoteRow[];
    },
  });

  const columns: Column<CustomerQuoteRow>[] = [
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
        <span className="font-medium tabular-nums">
          {formatCurrency(r.totalCents)}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Last Update',
      align: 'right',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {new Date(r.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-base">Your recent quotes</CardTitle>
        <CardDescription>
          The ten most recent quotes your organization has with us. Click any
          row to view the full quote in the customer portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => setView('portal', { quoteId: r.id })}
            emptyTitle="No quotes yet"
            emptyDescription="When your account team creates quotes for you, they will appear here."
          />
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Health Alerts panel (from Phase 12 — kept intact)
// ────────────────────────────────────────────────────────────────────────────

function HealthAlertsPanel() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [running, setRunning] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<HealthEventRow[]>({
    queryKey: ['health-events-open'],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '10', status: 'OPEN' });
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
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Health check failed');
      }
      return res.json();
    },
    onMutate: () => setRunning(true),
    onSuccess: (json) => {
      const summary = json?.data;
      const msg = summary?.mode === 'single'
        ? `Health check complete — ${summary.events.length} alert(s) on quote.`
        : `Health check complete — scanned ${summary?.scanned ?? 0} quote(s), ${summary?.events ?? 0} alert(s).`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['health-events-open'] });
      qc.invalidateQueries({ queryKey: ['quote-health-events'] });
      qc.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setRunning(false),
  });

  const alerts = (data ?? []).slice(0, 10);

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <CardTitle className="text-base">Deal Health Alerts</CardTitle>
              <CardDescription>
                Deterministic anomaly detection across your open pipeline. Open alerts, newest first.
              </CardDescription>
            </div>
          </div>
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
              disabled={running}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {running ? (
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
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No open health alerts
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All deals look healthy. Run the health check to refresh the scan.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {a.type.replace(/_/g, ' ')}
                    </span>
                    {a.quote ? (
                      <button
                        type="button"
                        onClick={() => setView('quote-detail', { quoteId: a.quote!.id })}
                        className="font-mono text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {a.quote.number}
                      </button>
                    ) : null}
                    <span className="text-[11px] text-slate-500">
                      {a.quote ? `${a.quote.customer?.name ?? '—'} · ${a.quote.owner?.name ?? '—'}` : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{a.evidence}</p>
                  {a.recommendedAction && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium">Recommended:</span> {a.recommendedAction}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-slate-500 sm:pl-3">
                  {new Date(a.detectedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
