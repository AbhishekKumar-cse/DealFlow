'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sparkles, Loader2, Lightbulb, MessageSquare, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AiInsightsPanelProps {
  quoteId: string;
}

type Insight =
  | { kind: 'risk'; summary: string; customerFacingSummary: string; recommendations: string[] }
  | { kind: 'summary'; oneLiner: string; highlights: string[]; nextSteps: string[] }
  | { kind: 'talking'; opening: string; valueProps: string[]; closing: string };

export function AiInsightsPanel({ quoteId }: AiInsightsPanelProps) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [mode, setMode] = useState<'risk' | 'summary' | 'talking'>('summary');

  const mut = useMutation({
    mutationFn: async (m: 'risk' | 'summary' | 'talking') => {
      const endpoint =
        m === 'risk'
          ? '/api/ai/risk-explanation'
          : m === 'summary'
          ? '/api/ai/quote-summary'
          : '/api/ai/talking-points';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'AI failed');
      return res.json();
    },
    onSuccess: (data, m) => {
      setInsight({ kind: m, ...(data as any) });
      toast.success('AI insight generated.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-violet-200 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/10">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-violet-600" />
            AI Insights
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              Optional
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={mode === 'summary' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('summary')}
              disabled={mut.isPending}
            >
              <TrendingUp className="mr-1 h-3 w-3" /> Deal
            </Button>
            <Button
              variant={mode === 'risk' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('risk')}
              disabled={mut.isPending}
            >
              <Lightbulb className="mr-1 h-3 w-3" /> Risk
            </Button>
            <Button
              variant={mode === 'talking' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('talking')}
              disabled={mut.isPending}
            >
              <MessageSquare className="mr-1 h-3 w-3" /> Talk
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {!insight ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Generate an AI summary of this deal, an explanation of the risk, or sales talking points. AI is non-authoritative — deterministic engines remain the source of truth.
            </p>
            <Button onClick={() => mut.mutate(mode)} disabled={mut.isPending}>
              {mut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Generate insight
                </>
              )}
            </Button>
          </div>
        ) : (
          <InsightRenderer insight={insight} onRegenerate={() => mut.mutate(mode)} regenerating={mut.isPending} />
        )}
      </CardContent>
    </Card>
  );
}

function InsightRenderer({
  insight,
  onRegenerate,
  regenerating,
}: {
  insight: Insight;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="space-y-3">
      {insight.kind === 'risk' && (
        <RiskInsight insight={insight} />
      )}
      {insight.kind === 'summary' && (
        <SummaryInsight insight={insight} />
      )}
      {insight.kind === 'talking' && (
        <TalkingInsight insight={insight} />
      )}
      <div className="flex justify-end pt-2">
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-3 w-3" />
          )}
          Regenerate
        </Button>
      </div>
    </div>
  );
}

function RiskInsight({ insight }: { insight: Extract<Insight, { kind: 'risk' }> }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
          Internal summary
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{insight.summary}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Customer-facing (safe)
        </p>
        <p className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          {insight.customerFacingSummary}
        </p>
      </div>
      {insight.recommendations.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recommendations
          </p>
          <ul className="space-y-1 text-sm">
            {insight.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryInsight({ insight }: { insight: Extract<Insight, { kind: 'summary' }> }) {
  return (
    <div className="space-y-3">
      <p className="text-base font-medium text-slate-900 dark:text-slate-100">{insight.oneLiner}</p>
      {insight.highlights.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Highlights
          </p>
          <ul className="space-y-1 text-sm">
            {insight.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      {insight.nextSteps.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Next steps
          </p>
          <ul className="space-y-1 text-sm">
            {insight.nextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TalkingInsight({ insight }: { insight: Extract<Insight, { kind: 'talking' }> }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
          Opening
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{insight.opening}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Value propositions
        </p>
        <ul className="space-y-1.5 text-sm">
          {insight.valueProps.map((v, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                {i + 1}
              </span>
              {v}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Closing
        </p>
        <p className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          {insight.closing}
        </p>
      </div>
    </div>
  );
}
