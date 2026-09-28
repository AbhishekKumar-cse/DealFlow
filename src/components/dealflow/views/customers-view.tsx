'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { TierBadge } from '@/components/dealflow/badges';
import { formatCurrency, fromDecimal } from '@/lib/money';

interface CustomerRow {
  id: string;
  name: string;
  tier: string;
  email: string | null;
  phone: string | null;
  currency: string;
  assignedRep?: { id: string; name: string; email: string } | null;
  _count: { quotes: number; contacts: number };
  active: boolean;
  createdAt: string;
}

interface RepRow {
  id: string;
  name: string;
  email: string;
}

export function CustomersView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openCreate, setOpenCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const q = search ? `&search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/customers?page=1&pageSize=50${q}`);
      const json = await res.json();
      return json.data as CustomerRow[];
    },
  });

  const { data: reps } = useQuery<RepRow[]>({
    queryKey: ['reps'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=SALES_REP');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create customer');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Customer created.');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setOpenCreate(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900 dark:text-slate-100">{row.name}</span>
          {row.email && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{row.email}</span>
          )}
        </div>
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (row) => <TierBadge tier={row.tier} />,
    },
    {
      key: 'rep',
      header: 'Sales rep',
      render: (row) =>
        row.assignedRep ? (
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {row.assignedRep.name}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Unassigned</span>
        ),
    },
    {
      key: 'quotes',
      header: 'Quotes',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row._count.quotes}</span>,
    },
    {
      key: 'contacts',
      header: 'Contacts',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row._count.contacts}</span>,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (row) => <span className="text-xs text-slate-500">{row.currency}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Customers</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organizations buying from you. Tiers drive discount ceilings.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9"
            />
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create customer</DialogTitle>
                <DialogDescription>
                  Add a new organization. Tier drives discount ceilings in Phase 06.
                </DialogDescription>
              </DialogHeader>
              <CustomerForm
                reps={reps ?? []}
                onSubmit={(v) => createMut.mutate(v)}
                submitting={createMut.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No customers yet"
        emptyDescription="Create your first customer to start quoting."
      />
    </div>
  );
}

interface CustomerFormProps {
  reps: RepRow[];
  onSubmit: (v: Record<string, unknown>) => void;
  submitting?: boolean;
  initial?: Partial<CustomerRow>;
}

function CustomerForm({ reps, onSubmit, submitting, initial }: CustomerFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [tier, setTier] = useState(initial?.tier ?? 'BRONZE');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [billingAddress, setBillingAddress] = useState('');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [assignedRepId, setAssignedRepId] = useState(initial?.assignedRep?.id ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          tier,
          email: email || undefined,
          phone: phone || undefined,
          billingAddress: billingAddress || undefined,
          currency,
          assignedRepId: assignedRepId || undefined,
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Name</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-tier">Tier</Label>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger id="c-tier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRONZE">Bronze</SelectItem>
              <SelectItem value="SILVER">Silver</SelectItem>
              <SelectItem value="GOLD">Gold</SelectItem>
              <SelectItem value="PLATINUM">Platinum</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="c-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">₹ INR</SelectItem>
              <SelectItem value="USD">$ USD</SelectItem>
              <SelectItem value="EUR">€ EUR</SelectItem>
              <SelectItem value="GBP">£ GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-email">Email</Label>
        <Input
          id="c-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-phone">Phone</Label>
        <Input
          id="c-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-billing">Billing address</Label>
        <Textarea
          id="c-billing"
          rows={2}
          value={billingAddress}
          onChange={(e) => setBillingAddress(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-rep">Assigned rep</Label>
        <Select value={assignedRepId} onValueChange={setAssignedRepId}>
          <SelectTrigger id="c-rep">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            {reps.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name} · {r.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Creating…' : 'Create customer'}
        </Button>
      </DialogFooter>
    </form>
  );
}
