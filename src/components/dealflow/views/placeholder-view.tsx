'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

/**
 * Placeholder view shown until each phase lands its real implementation.
 * Every view file is committed in Phase 01 so the AppShell wiring is stable;
 * the actual content is filled in incrementally in later phases.
 */
export function PlaceholderView({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <Card className="mx-auto max-w-2xl border-dashed border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <Construction className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">{phase}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
      </CardContent>
    </Card>
  );
}
