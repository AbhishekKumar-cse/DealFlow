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
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  DatabaseZap,
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
  Activity,
  ScrollText,
  User,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegisterDataRow {
  id: number;
  userId: string | null;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  company: string | null;
  companySize: string | null;
  jobTitle: string | null;
  department: string | null;
  role: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  website: string | null;
  bio: string | null;
  agreeToTerms: boolean;
  marketingOptIn: boolean;
  productUpdates: boolean;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  signupSource: string;
  referralCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RegisterStats {
  total: number;
  active: number;
  suspended: number;
  pending: number;
  emailVerified: number;
  last7Days: number;
  last30Days: number;
  neverLoggedIn: number;
  byRole: { role: string; count: number }[];
  byCountry: { country: string; count: number }[];
}

interface RegisterDetail extends RegisterDataRow {
  activity: {
    id: number;
    activityType: string;
    description: string | null;
    ipAddress: string | null;
    createdAt: string;
  }[];
  audit: {
    id: number;
    action: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string | null;
    reason: string | null;
    createdAt: string;
  }[];
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
  PENDING: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  DELETED: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
};

export function RegisterDataView() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<RegisterDataRow[]>({
    queryKey: ['register-data', search, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/register-data?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load register data');
      const json = await res.json();
      return json.data as RegisterDataRow[];
    },
  });

  const { data: stats } = useQuery<RegisterStats>({
    queryKey: ['register-data-stats'],
    queryFn: async () => (await fetch('/api/register-data/stats')).json(),
    refetchInterval: 30_000,
  });

  const { data: detail } = useQuery<RegisterDetail>({
    queryKey: ['register-data-detail', selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/register-data/${selectedId}`);
      if (!res.ok) throw new Error('Failed to load detail');
      const json = await res.json();
      return json.data as RegisterDetail;
    },
    enabled: selectedId !== null,
  });

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Register Data DB</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          New database <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">db/register_data.db</code>{' '}
          with 3 tables: <strong>RegisterData</strong> (40+ columns),{' '}
          <strong>RegisterActivity</strong>, <strong>RegisterAuditLog</strong>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard label="Total" value={stats?.total ?? 0} tone="emerald" />
        <StatCard label="Active" value={stats?.active ?? 0} tone="sky" />
        <StatCard label="Email Verified" value={stats?.emailVerified ?? 0} tone="amber" />
        <StatCard label="Last 7 days" value={stats?.last7Days ?? 0} tone="violet" />
        <StatCard label="Never Logged In" value={stats?.neverLoggedIn ?? 0} tone="rose" />
      </div>

      {/* Role breakdown */}
      {stats?.byRole && stats.byRole.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <DatabaseZap className="h-4 w-4 text-violet-600" />
              Registrations by Role
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.byRole.map((r) => (
              <div
                key={r.role}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium',
                  ROLE_TONES[r.role] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                <span className="uppercase tracking-wider">{r.role.replace('_', ' ')}</span>
                <span className="rounded-full bg-white/60 px-2 py-0.5 tabular-nums dark:bg-slate-900/60">
                  {r.count}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search name, email, or company…"
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
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <DatabaseZap className="h-4 w-4 text-emerald-600" />
            RegisterData Records
            <Badge variant="secondary" className="ml-2 tabular-nums">
              {rows.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Click any row to see the full detail (including activity log + audit log).
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
                <DatabaseZap className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No registrations found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign out and create a new account to populate this table.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Role</th>
                    <th className="px-4 py-2 text-left">Company</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-center">Verified</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Logins</th>
                    <th className="px-4 py-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">
                            {r.fullName[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">{r.fullName}</p>
                            {r.jobTitle && <p className="truncate text-xs text-slate-500">{r.jobTitle}</p>}
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
                        <div className="flex items-center justify-center gap-1">
                          {r.emailVerified ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', STATUS_TONES[r.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.loginCount}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
                    {detail.fullName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex flex-col">
                    <span>{detail.fullName}</span>
                    <span className={cn('mt-0.5 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', ROLE_TONES[detail.role] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                      {detail.role.replace('_', ' ')}
                    </span>
                  </div>
                </SheetTitle>
                <SheetDescription>
                  Full detail from register_data_db (RegisterData + Activity + AuditLog)
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-8">
                {/* Identity */}
                <Section title="Identity">
                  <Row icon={Mail} label="Email" value={detail.email} mono />
                  <Row icon={Fingerprint} label="Register ID" value={String(detail.id)} mono small />
                  <Row icon={User} label="User ID (main DB)" value={detail.userId} mono small />
                  <Row icon={User} label="First / Last" value={`${detail.firstName}${detail.lastName ? ' ' + detail.lastName : ''}`} />
                </Section>

                {/* Contact */}
                <Section title="Contact">
                  <Row icon={Phone} label="Phone" value={detail.phone} />
                  <Row icon={Building2} label="Company" value={detail.company} />
                  {detail.companySize && <Row icon={Building2} label="Company size" value={detail.companySize} />}
                  <Row icon={Briefcase} label="Job title" value={detail.jobTitle} />
                  {detail.department && <Row icon={Briefcase} label="Department" value={detail.department} />}
                  {detail.website && <Row icon={Globe} label="Website" value={detail.website} mono small />}
                </Section>

                {/* Address */}
                <Section title="Address">
                  <Row icon={MapPin} label="Address line 1" value={detail.addressLine1} />
                  <Row icon={MapPin} label="City" value={detail.city} />
                  {detail.state && <Row icon={MapPin} label="State" value={detail.state} />}
                  <Row icon={Globe} label="Country" value={detail.country} />
                  <Row icon={MapPin} label="ZIP / Postal" value={detail.zipCode} />
                </Section>

                {/* Consent + Verification */}
                <Section title="Consent & Verification">
                  <ConsentRow label="Agreed to Terms" value={detail.agreeToTerms} />
                  <ConsentRow label="Marketing opt-in" value={detail.marketingOptIn} />
                  <ConsentRow label="Product updates" value={detail.productUpdates} />
                  <ConsentRow label="Email verified" value={detail.emailVerified} />
                  <ConsentRow label="Phone verified" value={detail.phoneVerified} />
                </Section>

                {/* Metadata */}
                <Section title="Metadata">
                  <Row icon={Server} label="Signup source" value={detail.signupSource} />
                  {detail.referralCode && <Row icon={Fingerprint} label="Referral code" value={detail.referralCode} mono small />}
                  <Row icon={Globe} label="IP address" value={detail.ipAddress} mono small />
                  <Row icon={Server} label="User agent" value={detail.userAgent} small />
                  <Row icon={ShieldCheck} label="Status" value={detail.status} />
                </Section>

                {/* Timestamps */}
                <Section title="Timestamps">
                  <Row icon={Calendar} label="Created at" value={new Date(detail.createdAt).toLocaleString()} />
                  <Row icon={Calendar} label="Updated at" value={new Date(detail.updatedAt).toLocaleString()} />
                  <Row icon={Clock} label="Last login" value={detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString() : 'Never'} />
                  <Row icon={Activity} label="Login count" value={String(detail.loginCount)} />
                </Section>

                {/* Activity log */}
                <Section title={`Activity Log (${detail.activity.length})`}>
                  {detail.activity.length === 0 ? (
                    <p className="text-xs italic text-slate-500">No activity recorded yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {detail.activity.map((a) => (
                        <li key={a.id} className="flex items-start gap-2 text-xs">
                          <Activity className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                          <div>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{a.activityType}</span>
                            {a.description && <span className="ml-1 text-slate-500">{a.description}</span>}
                            <span className="ml-2 text-slate-400">· {new Date(a.createdAt).toLocaleString()}</span>
                            {a.ipAddress && <span className="ml-2 font-mono text-slate-400">· {a.ipAddress}</span>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>

                {/* Audit log */}
                <Section title={`Audit Log (${detail.audit.length})`}>
                  {detail.audit.length === 0 ? (
                    <p className="text-xs italic text-slate-500">No audit entries yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {detail.audit.map((a) => (
                        <li key={a.id} className="flex items-start gap-2 text-xs">
                          <ScrollText className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                          <div>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{a.action}</span>
                            {a.fieldName && <span className="ml-1 text-slate-500">on {a.fieldName}</span>}
                            {a.oldValue != null && a.newValue != null && (
                              <span className="ml-1">
                                <span className="text-rose-600 line-through">{a.oldValue}</span>
                                <span className="mx-1 text-slate-400">→</span>
                                <span className="text-emerald-600">{a.newValue}</span>
                              </span>
                            )}
                            {a.reason && <span className="ml-2 italic text-slate-500">{a.reason}</span>}
                            <span className="ml-2 text-slate-400">· {new Date(a.createdAt).toLocaleString()}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>
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
    violet: 'text-violet-700 dark:text-violet-400',
    rose: 'text-rose-700 dark:text-rose-400',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneMap[tone] ?? 'text-slate-900 dark:text-slate-100')}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      <div className="space-y-1.5 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">{children}</div>
    </div>
  );
}

function Row({
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
