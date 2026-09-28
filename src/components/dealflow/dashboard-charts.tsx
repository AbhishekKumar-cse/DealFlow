// src/components/dealflow/dashboard-charts.tsx
//
// Recharts components for the Live Executive Dashboard (Phase 13).
// Each chart is self-contained (renders its own Card + title + chart).
// Colors: emerald (SAFE/positive), sky (REVIEW/neutral), amber (warn),
// rose (risk/critical). Hex values are used (Recharts doesn't process
// CSS variables).

'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/money';

// ────────────────────────────────────────────────────────────────────────────
// Color palette (hex — Recharts doesn't process CSS variables)
// ────────────────────────────────────────────────────────────────────────────

const COLORS = {
  emerald: '#10b981',
  sky: '#0ea5e9',
  amber: '#f59e0b',
  rose: '#f43f5e',
  teal: '#14b8a6',
  violet: '#8b5cf6',
  slate: '#64748b',
} as const;

const RISK_COLORS: Record<string, string> = {
  SAFE: COLORS.emerald,
  REVIEW: COLORS.sky,
  MANAGER: COLORS.amber,
  FINANCE: COLORS.rose,
};

const FULFILLMENT_COLORS: Record<string, string> = {
  FULFILLING: COLORS.amber,
  FULFILLED: COLORS.emerald,
  PARTIAL: COLORS.rose,
  BACKORDERED: COLORS.rose,
};

// Approval aging: amber gradient (light → dark) — older = more urgent.
const AGING_COLORS = ['#fde68a', '#fcd34d', '#f59e0b', '#d97706'];

// Discount distribution: teal→rose — higher discounts escalate to rose.
const DISCOUNT_COLORS = [
  COLORS.teal,
  '#0d9488',
  '#0f766e',
  '#115e59',
  COLORS.rose,
];

// Axis + grid styling. The muted color values are HSL for slate-500 / slate-200
// which work in both light and dark themes for chart axis text.
const AXIS_TICK_PROPS = {
  fontSize: 11,
  fill: '#64748b', // slate-500
} as const;

const GRID_STROKE = '#e2e8f0'; // slate-200 — visible on both light + dark

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-xs text-slate-400 dark:text-slate-500">
      {message}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Pipeline by Stage — horizontal bar chart of stage counts.
// ────────────────────────────────────────────────────────────────────────────

export interface PipelineByStageDatum {
  stage: string;
  count: number;
}

export function PipelineByStageChart({ data }: { data: PipelineByStageDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Pipeline by stage</CardTitle>
        <CardDescription className="text-xs">
          {total} quote{total === 1 ? '' : 's'} across the lifecycle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No quotes in the pipeline yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_TICK_PROPS} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="stage"
                tick={AXIS_TICK_PROPS}
                width={92}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" fill={COLORS.emerald} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Risk Distribution — donut chart of submitted-quote risk bands.
// ────────────────────────────────────────────────────────────────────────────

export interface RiskDistributionDatum {
  band: string;
  count: number;
}

export function RiskDistributionChart({ data }: { data: RiskDistributionDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const withColors = data.map((d) => ({
    name: d.band,
    value: d.count,
    color: RISK_COLORS[d.band] ?? COLORS.slate,
  }));
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Risk distribution</CardTitle>
        <CardDescription className="text-xs">
          {total} submitted quote{total === 1 ? '' : 's'} by risk band.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No submitted quotes to assess yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={withColors}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={70}
                paddingAngle={2}
              >
                {withColors.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}`, 'Quotes']} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Approval Aging — vertical bar chart of age buckets.
// ────────────────────────────────────────────────────────────────────────────

export interface ApprovalAgingDatum {
  bucket: string;
  count: number;
}

export function ApprovalAgingChart({ data }: { data: ApprovalAgingDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const withColors = data.map((d, i) => ({
    bucket: d.bucket,
    count: d.count,
    color: AGING_COLORS[i] ?? COLORS.amber,
  }));
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Approval aging</CardTitle>
        <CardDescription className="text-xs">
          {total} pending approval{total === 1 ? '' : 's'} by age bucket.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No pending approvals. ✓" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={withColors} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="bucket" tick={AXIS_TICK_PROPS} />
              <YAxis tick={AXIS_TICK_PROPS} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {withColors.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Discount Distribution — vertical bar chart of discount % buckets.
// ────────────────────────────────────────────────────────────────────────────

export interface DiscountDistributionDatum {
  bucket: string;
  count: number;
}

export function DiscountDistributionChart({ data }: { data: DiscountDistributionDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const withColors = data.map((d, i) => ({
    bucket: d.bucket,
    count: d.count,
    color: DISCOUNT_COLORS[i] ?? COLORS.teal,
  }));
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Discount distribution</CardTitle>
        <CardDescription className="text-xs">
          {total} submitted quote{total === 1 ? '' : 's'} by avg discount %.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No submitted quotes yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={withColors} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="bucket" tick={AXIS_TICK_PROPS} />
              <YAxis tick={AXIS_TICK_PROPS} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {withColors.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Fulfillment State — horizontal bar chart of fulfillment order counts.
// ────────────────────────────────────────────────────────────────────────────

export interface FulfillmentStateDatum {
  status: string;
  count: number;
}

export function FulfillmentStateChart({ data }: { data: FulfillmentStateDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const withColors = data.map((d) => ({
    status: d.status,
    count: d.count,
    color: FULFILLMENT_COLORS[d.status] ?? COLORS.slate,
  }));
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Fulfillment state</CardTitle>
        <CardDescription className="text-xs">
          {total} fulfillment order{total === 1 ? '' : 's'} across warehouses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No fulfillment orders yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={withColors}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_TICK_PROPS} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="status"
                tick={AXIS_TICK_PROPS}
                width={92}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {withColors.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Revenue Mix — pie chart recurring MRR vs one-time invoiced revenue.
// ────────────────────────────────────────────────────────────────────────────

export interface RevenueMixDatum {
  recurring: number; // cents (monthly-equivalent MRR)
  oneTime: number; // cents (issued one-time invoices)
}

export function RevenueMixChart({ data }: { data: RevenueMixDatum }) {
  const total = data.recurring + data.oneTime;
  const chartData: ChartDatum[] = [
    { label: 'Recurring (MRR)', value: data.recurring, color: COLORS.emerald },
    { label: 'One-time', value: data.oneTime, color: COLORS.teal },
  ];
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recurring vs one-time</CardTitle>
        <CardDescription className="text-xs">
          MRR vs issued one-time invoices (monthly view).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState message="No revenue recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={70}
                paddingAngle={2}
                label={(props: any) => formatCurrency(props.value as number)}
              >
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared tooltip styling (light + dark friendly)
// ────────────────────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)', // slate-900
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  color: '#f1f5f9', // slate-100
  fontSize: 12,
  padding: '6px 10px',
};
