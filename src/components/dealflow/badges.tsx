'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RiskBand, QuoteStatus, ApprovalStatus, FulfillmentStatus, HealthSeverity } from '@/lib/enums';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
};

export function TierBadge({ tier }: { tier: string }) {
  const tone =
    tier === 'PLATINUM'
      ? TONES.violet
      : tier === 'GOLD'
      ? TONES.amber
      : tier === 'SILVER'
      ? TONES.gray
      : TONES.blue;
  return (
    <Badge className={cn('border-0 font-medium uppercase tracking-wider', tone)}>
      {tier}
    </Badge>
  );
}

export function RiskBandBadge({ band }: { band: RiskBand | string | null | undefined }) {
  if (!band) return <span className="text-slate-400">—</span>;
  const tone =
    band === 'SAFE'
      ? TONES.green
      : band === 'REVIEW'
      ? TONES.blue
      : band === 'MANAGER'
      ? TONES.amber
      : TONES.red;
  return (
    <Badge className={cn('border-0 font-medium', tone)}>
      {band}
    </Badge>
  );
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus | string }) {
  const tone =
    status === 'DRAFT'
      ? TONES.gray
      : status === 'SUBMITTED' || status === 'PENDING_MANAGER' || status === 'PENDING_FINANCE'
      ? TONES.amber
      : status === 'APPROVED' || status === 'CONFIRMED' || status === 'FULFILLED'
      ? TONES.green
      : status === 'REJECTED' || status === 'CANCELLED'
      ? TONES.red
      : TONES.blue;
  const label = status.replace(/_/g, ' ').toLowerCase();
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {label}
    </Badge>
  );
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus | string }) {
  const tone =
    status === 'PENDING'
      ? TONES.amber
      : status === 'APPROVED'
      ? TONES.green
      : status === 'REJECTED'
      ? TONES.red
      : status === 'RETURNED'
      ? TONES.blue
      : TONES.gray;
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {status.toLowerCase()}
    </Badge>
  );
}

export function FulfillmentStatusBadge({ status }: { status: FulfillmentStatus | string }) {
  const tone =
    status === 'FULFILLED'
      ? TONES.green
      : status === 'FULFILLING'
      ? TONES.amber
      : status === 'PARTIAL' || status === 'BACKORDERED'
      ? TONES.red
      : TONES.gray;
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {status.toLowerCase()}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: HealthSeverity | string }) {
  const tone =
    severity === 'CRITICAL'
      ? TONES.red
      : severity === 'WARN'
      ? TONES.amber
      : TONES.blue;
  return (
    <Badge className={cn('border-0 font-medium uppercase', tone)}>
      {severity}
    </Badge>
  );
}

export function NegotiationStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'OPEN'
      ? TONES.amber
      : status === 'ACCEPTED'
      ? TONES.green
      : status === 'REJECTED'
      ? TONES.red
      : TONES.gray;
  const label = status === 'SUPERSEDED' ? 'superseded' : status.toLowerCase();
  return (
    <Badge className={cn('border-0 font-medium capitalize', tone)}>
      {label}
    </Badge>
  );
}
