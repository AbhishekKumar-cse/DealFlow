'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  UserCheck,
  Mail,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Globe,
  Calendar,
  Clock,
  ShieldCheck,
  Server,
  Fingerprint,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegistrationRow {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  zipCode: string | null;
  agreeToTerms: boolean;
  marketingOptIn: boolean;
  signupSource: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  byRole: { role: string; count: number }[];
  byCountry: { country: string; count: number }[];
  last7Days: number;
  last30Days: number;
  neverLoggedIn: number;
}

const ROLE_TONES: Record<string, string> = {
  SALES_REP: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  SALES_MANAGER: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  FINANCE_OPERATIONS: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  CUSTOMER: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  ADMIN: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
};

const STATUS_TONES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  SUSPENDED: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  DELETED: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
};

export function RegistrationsView() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<RegistrationRow | null>(null);

  const { data, isLoading } = useQuery<RegistrationRow[]>({
    queryKey: ['registrations', search, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/registrations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load registrations');
      const json = await res.json();
      return json.data as RegistrationRow[];
    },
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['registration-stats'],
    queryFn: async () => (await fetch('/api/registrations/stats')).json(),
    refetchInterval: 30_000,
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Registered Users</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          All sign-up details are stored in the dedicated{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">logic_details_db</code>{' '}
          SQLite database (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">db/logic_details.db</code>).
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Registrations" value={stats?.total ?? 0} tone="emerald" />
        <StatCard label="Active" value={stats?.active ?? 0} tone="sky" />
        <StatCard label="Last 7 days" value={stats?.last7Days ?? 0} tone="amber" />
        <StatCard label="Never logged in" value={stats?.neverLoggedIn ?? 0} tone="rose" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, email, or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="SALES_REP">Sales Rep</SelectItem>
            <SelectItem value="SALES_MANAGER">Sales Manager</SelectItem>
            <SelectItem value="FINANCE_OPERATIONS">Finance Ops</SelectItem>
            <SelectItem value="CUSTOMER">Customer</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Registrations table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            Registration Records
            <Badge variant="secondary" className="ml-2 tabular-nums">
              {rows.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Click any row to see the full registration details (including IP address, user agent, and consent flags).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                <UserCheck className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No registrations found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign out and use the "Create an account" link to register a new user.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Role</th>
                    <th className="px-4 py-2 text-left">Company</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-semibold text-white dark:from-slate-200 dark:to-slate-400 dark:text-slate-900">
                            {r.fullName[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">{r.fullName}</p>
                            {r.jobTitle && (
                              <p className="truncate text-xs text-slate-500">{r.jobTitle}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.email}</td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', ROLE_TONES[r.role] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                          {r.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.company ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {r.city || r.country ? `${r.city ?? ''}${r.city && r.country ? ', ' : ''}${r.country ?? ''}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', STATUS_TONES[r.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
                    {selected.fullName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex flex-col">
                    <span>{selected.fullName}</span>
                    <span className={cn('mt-0.5 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', ROLE_TONES[selected.role] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                      {selected.role.replace('_', ' ')}
                    </span>
                  </div>
                </SheetTitle>
                <SheetDescription>
                  Full registration details from logic_details_db
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-8">
                {/* Identity */}
                <DetailSection title="Identity">
                  <DetailRow icon={Mail} label="Email" value={selected.email} mono />
                  <DetailRow icon={UserCheck} label="User ID" value={selected.userId} mono small />
                  <DetailRow icon={Fingerprint} label="Registration ID" value={selected.id} mono small />
                </DetailSection>

                {/* Contact */}
                <DetailSection title="Contact">
                  <DetailRow icon={Phone} label="Phone" value={selected.phone} />
                  <DetailRow icon={Building2} label="Company" value={selected.company} />
                  <DetailRow icon={Briefcase} label="Job title" value={selected.jobTitle} />
                </DetailSection>

                {/* Address */}
                <DetailSection title="Address">
                  <DetailRow icon={Globe} label="Country" value={selected.country} />
                  <DetailRow icon={MapPin} label="City" value={selected.city} />
                  <DetailRow icon={MapPin} label="Address" value={selected.address} />
                  <DetailRow icon={MapPin} label="ZIP / Postal" value={selected.zipCode} />
                </DetailSection>

                {/* Consent */}
                <DetailSection title="Consent">
                  <ConsentRow label="Agreed to Terms of Service" value={selected.agreeToTerms} />
                  <ConsentRow label="Marketing opt-in" value={selected.marketingOptIn} />
                </DetailSection>

                {/* Metadata */}
                <DetailSection title="Metadata">
                  <DetailRow icon={Server} label="Signup source" value={selected.signupSource} />
                  <DetailRow icon={Globe} label="IP address" value={selected.ipAddress} mono small />
                  <DetailRow icon={Server} label="User agent" value={selected.userAgent} small />
                  <DetailRow icon={ShieldCheck} label="Status" value={selected.status} />
                </DetailSection>

                {/* Timestamps */}
                <DetailSection title="Timestamps">
                  <DetailRow icon={Calendar} label="Created at" value={new Date(selected.createdAt).toLocaleString()} />
                  <DetailRow icon={Calendar} label="Updated at" value={new Date(selected.updatedAt).toLocaleString()} />
                  <DetailRow icon={Clock} label="Last login" value={selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString() : 'Never'} />
                  <DetailRow icon={ShieldCheck} label="Email verified" value={selected.emailVerifiedAt ? new Date(selected.emailVerifiedAt).toLocaleString() : 'Not verified'} />
                </DetailSection>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneMap: Record<string, string> = {
    emerald: 'text-emerald-700 dark:text-emerald-400',
    sky: 'text-sky-700 dark:text-sky-400',
    amber: 'text-amber-700 dark:text-amber-400',
    rose: 'text-rose-700 dark:text-rose-400',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneMap[tone] ?? 'text-slate-900 dark:text-slate-100')}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <div className="space-y-1.5 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
        <p className={cn('break-words text-slate-800 dark:text-slate-200', mono && 'font-mono', small && 'text-xs')}>
          {value ?? <span className="italic text-slate-400">—</span>}
        </p>
      </div>
    </div>
  );
}

function ConsentRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', value ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  );
}
