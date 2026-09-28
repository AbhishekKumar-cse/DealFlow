'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskBandBadge } from '@/components/dealflow/badges';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RiskExplanation {
  score: number;
  band: string;
  violations: number;
  reasons: string[];
  contributingFactors: string[];
  recommendedAction: string;
  penalties: { name: string; amount: number }[];
  lineEvaluations: {
    lineId: string;
    productName: string;
    overagePct: number;
    requested: number;
    ceiling: number;
    violation: boolean;
    revenueWeight: number;
    reason: string;
  }[];
}

export function RiskExplainer({ risk }: { risk: RiskExplanation | null }) {
  if (!risk) {
    return (
      <Card className="border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/40">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-slate-500">
          <Info className="h-4 w-4" />
          Risk not yet evaluated. Submit the quote to compute risk.
        </CardContent>
      </Card>
    );
  }

  const tone =
    risk.band === 'FINANCE'
      ? 'border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20'
      : risk.band === 'MANAGER'
      ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
      : risk.band === 'REVIEW'
      ? 'border-sky-300 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20'
      : 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20';

  return (
    <div className="space-y-3">
      <Card className={tone}>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  Risk band
                </span>
                <div className="mt-1 flex items-center gap-3">
                  <RiskBandBadge band={risk.band} />
                  <span className="text-3xl font-bold tabular-nums">{risk.score}</span>
                  <span className="text-xs text-slate-500">/ 100</span>
                </div>
              </div>
              <div className="ml-4 flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  Violations
                </span>
                <span
                  className={cn(
                    'flex items-center gap-1 text-sm font-medium',
                    risk.violations === 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400',
                  )}
                >
                  {risk.violations === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {risk.violations} {risk.violations === 1 ? 'line' : 'lines'}
                </span>
              </div>
            </div>
            <div className="max-w-md text-right text-sm text-slate-600 dark:text-slate-300">
              {risk.recommendedAction}
            </div>
          </div>
        </CardContent>
      </Card>

      {risk.reasons.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Why this score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
              {risk.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {r}
                </li>
              ))}
            </ul>
            {risk.contributingFactors.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Contributing factors
                </p>
                <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {risk.contributingFactors.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {risk.penalties.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Penalties applied
                </p>
                <div className="flex flex-wrap gap-2">
                  {risk.penalties.map((p, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                    >
                      {p.name}: +{p.amount}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {risk.lineEvaluations.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Line-by-line evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {risk.lineEvaluations.map((l) => (
              <div
                key={l.lineId}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 text-sm',
                  l.violation
                    ? 'border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
                )}
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">
                  {l.violation ? '!' : '✓'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.productName}</p>
                  <p className="text-xs text-slate-500">{l.reason}</p>
                </div>
                <div className="text-right text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Requested</span>
                    <span className="font-semibold tabular-nums">{l.requested}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Ceiling</span>
                    <span className="font-semibold tabular-nums">{l.ceiling}%</span>
                  </div>
                  {l.violation && (
                    <div className="mt-0.5 text-rose-600 dark:text-rose-400">
                      +{l.overagePct}pp overage
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
