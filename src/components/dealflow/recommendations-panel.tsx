'use client';

// src/components/dealflow/recommendations-panel.tsx — Explainable
// upsell/cross-sell panel rendered inside the QuoteDetailView. Lets a
// sales rep:
//   1. Generate a deterministic top-5 recommendation set for the quote.
//   2. See the signal breakdown (co-purchase / margin / promotion /
//      category) and human-readable reasons for each suggestion.
//   3. Add a recommended product to the quote as a new line (qty=1,
//      discount=0) with a single click.
//
// The panel only renders for DRAFT/RETURNED quotes — see the guard in
// quote-detail-view.tsx.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Sparkles,
  Plus,
  RefreshCw,
  TrendingUp,
  Package,
  Tag,
  Layers,
} from 'lucide-react';
import { formatCurrency } from '@/lib/money';

interface RecommendationProduct {
  id: string;
  name: string;
  sku: string;
  listPriceCents: number;
  billingType: string;
  category: { id: string; name: string };
}

interface RecommendationResult {
  product: RecommendationProduct;
  score: number;
  coPurchaseScore: number;
  promotionScore: number;
  marginScore: number;
  categoryScore: number;
  reasons: string[];
  expectedMarginImpactCents: number;
}

interface PanelProps {
  quoteId: string;
}

export function RecommendationsPanel({ quoteId }: PanelProps) {
  const qc = useQueryClient();
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<RecommendationResult[]>({
    queryKey: ['quote-recommendations', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/recommendations`);
      const json = await res.json();
      return (json.data ?? []) as RecommendationResult[];
    },
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/recommendations/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to generate recommendations');
      }
      const json = await res.json();
      return (json.data ?? []) as RecommendationResult[];
    },
    onSuccess: (recs) => {
      toast.success(
        recs.length > 0
          ? `Generated ${recs.length} recommendations.`
          : 'No recommendations yet — add at least one product line first.',
      );
      setAddedProductIds(new Set());
      qc.invalidateQueries({ queryKey: ['quote-recommendations', quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/quotes/${quoteId}/recommendations/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to add to quote');
      }
      return res.json();
    },
    onSuccess: (_data, productId) => {
      toast.success('Added to quote as a new line.');
      setAddedProductIds((prev) => new Set(prev).add(productId));
      // The quote's lines and totals have changed — invalidate so the
      // QuoteDetailView re-fetches and shows the new line.
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recs = data ?? [];
  const hasRecs = recs.length > 0;
  const generating = generateMut.isPending;

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-amber-600" />
            Recommendations
            {hasRecs && (
              <span className="text-xs font-normal text-slate-500">
                · top {recs.length}
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMut.mutate()}
            disabled={generating}
          >
            {generating ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4 text-amber-600" />
            )}
            {generating ? 'Generating…' : hasRecs ? 'Regenerate' : 'Generate recommendations'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isLoading ? (
          <RecsSkeleton />
        ) : !hasRecs ? (
          <EmptyState generating={generating} />
        ) : (
          recs.map((r, i) => (
            <RecommendationCard
              key={r.product.id}
              rec={r}
              rank={i + 1}
              adding={addMut.isPending && addMut.variables === r.product.id}
              added={addedProductIds.has(r.product.id)}
              onAdd={() => addMut.mutate(r.product.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationCard({
  rec,
  rank,
  adding,
  added,
  onAdd,
}: {
  rec: RecommendationResult;
  rank: number;
  adding: boolean;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-100 text-sm font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            aria-label={`Recommendation rank ${rank}`}
          >
            {rank}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{rec.product.name}</span>
              <Badge className="border-0 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {rec.product.category.name || 'uncategorized'}
              </Badge>
              <span className="text-xs text-slate-500">
                {rec.product.billingType === 'RECURRING' ? 'Recurring' : 'One-time'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              SKU {rec.product.sku} · List {formatCurrency(rec.product.listPriceCents)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums">{rec.score}</span>
              <span className="text-xs text-slate-500">/ 100</span>
            </div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              score
            </span>
          </div>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SignalBar
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Co-purchase"
          value={rec.coPurchaseScore}
          tone="amber"
        />
        <SignalBar
          icon={<Package className="h-3.5 w-3.5" />}
          label="Margin"
          value={rec.marginScore}
          tone="emerald"
        />
        <SignalBar
          icon={<Tag className="h-3.5 w-3.5" />}
          label="Promotion"
          value={rec.promotionScore}
          tone="violet"
        />
        <SignalBar
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Category fit"
          value={rec.categoryScore}
          tone="sky"
        />
      </div>

      {/* Reasons */}
      {rec.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {rec.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {/* Footer actions */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="text-xs text-slate-500">
          Expected margin impact:{' '}
          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatCurrency(rec.expectedMarginImpactCents)}
          </span>
          <span className="ml-1 text-slate-400">(qty=1, no discount)</span>
        </div>
        <Button
          size="sm"
          onClick={onAdd}
          disabled={adding || added}
          variant={added ? 'outline' : 'default'}
        >
          {added ? (
            'Added'
          ) : (
            <>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {adding ? 'Adding…' : 'Add to quote'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

const SIGNAL_TONES: Record<string, string> = {
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
  sky: 'text-sky-600 dark:text-sky-400',
};

const SIGNAL_BAR_TONES: Record<string, string> = {
  amber: '[&>[data-slot=progress-indicator]]:bg-amber-500',
  emerald: '[&>[data-slot=progress-indicator]]:bg-emerald-500',
  violet: '[&>[data-slot=progress-indicator]]:bg-violet-500',
  sky: '[&>[data-slot=progress-indicator]]:bg-sky-500',
};

function SignalBar({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof SIGNAL_TONES;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`shrink-0 ${SIGNAL_TONES[tone]}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{label}</span>
          <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">
            {value}
          </span>
        </div>
        <Progress
          value={value}
          className={`mt-1 h-1.5 ${SIGNAL_BAR_TONES[tone]}`}
          aria-label={`${label} signal: ${value} out of 100`}
        />
      </div>
    </div>
  );
}

function EmptyState({ generating }: { generating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {generating ? 'Generating recommendations…' : 'No recommendations yet'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {generating
            ? 'Loading product catalog and co-purchase signals.'
            : 'Add at least one product line, then click "Generate recommendations" to surface upsell and cross-sell candidates.'}
        </p>
      </div>
    </div>
  );
}

function RecsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
