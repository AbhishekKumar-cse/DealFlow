'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { formatCurrency, fromDecimal } from '@/lib/money';

export function SettingsView() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Discount rules, risk thresholds, approval chains, warehouses, plans.
        </p>
      </div>
      <Tabs defaultValue="discount" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-8">
          <TabsTrigger value="discount">Discount</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
          <TabsTrigger value="warehouse">Warehouse</TabsTrigger>
          <TabsTrigger value="plan">Plans</TabsTrigger>
          <TabsTrigger value="category">Categories</TabsTrigger>
          <TabsTrigger value="price">Price lists</TabsTrigger>
          <TabsTrigger value="demo">Demo data</TabsTrigger>
        </TabsList>
        <TabsContent value="discount" className="mt-4">
          <DiscountRulesTab />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskConfigTab />
        </TabsContent>
        <TabsContent value="approval" className="mt-4">
          <ApprovalChainsTab />
        </TabsContent>
        <TabsContent value="warehouse" className="mt-4">
          <WarehousesTab />
        </TabsContent>
        <TabsContent value="plan" className="mt-4">
          <SubscriptionPlansTab />
        </TabsContent>
        <TabsContent value="category" className="mt-4">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="price" className="mt-4">
          <PriceListsTab />
        </TabsContent>
        <TabsContent value="demo" className="mt-4">
          <DemoDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Categories
// ──────────────────────────────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: { name: string; description?: string }) => {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Category created.');
      qc.invalidateQueries({ queryKey: ['categories'] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'desc', header: 'Description', render: (r) => <span className="text-sm text-slate-500">{r.description ?? '—'}</span> },
    {
      key: 'count',
      header: 'Products',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r._count?.products ?? 0}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create category</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({ name, description: description || undefined });
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">Description</Label>
                <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No categories"
        emptyDescription="Create Hardware / Accessories / Services / Subscriptions."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Discount rules
// ──────────────────────────────────────────────────────────────────────────

interface DiscountRuleRow {
  id: string;
  name: string;
  customerTier: string | null;
  maxPercent: number;
  warnPercent: number | null;
  priority: number;
  active: boolean;
  category: { id: string; name: string } | null;
  product: { id: string; name: string; sku: string } | null;
}

function DiscountRulesTab() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const { data, isLoading } = useQuery<DiscountRuleRow[]>({
    queryKey: ['discount-rules'],
    queryFn: async () => {
      const res = await fetch('/api/discount-rules');
      return res.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/discount-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Discount rule created.');
      qc.invalidateQueries({ queryKey: ['discount-rules'] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await fetch('/api/categories')).json(),
  });

  const columns: Column<DiscountRuleRow>[] = [
    { key: 'name', header: 'Rule', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'tier',
      header: 'Tier',
      render: (r) => <span className="text-sm text-slate-700">{r.customerTier ?? '—'}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-sm text-slate-700">{r.category?.name ?? '—'}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      render: (r) => <span className="text-sm text-slate-700">{r.product?.name ?? '—'}</span>,
    },
    {
      key: 'max',
      header: 'Max %',
      align: 'right',
      render: (r) => <span className="tabular-nums font-medium">{r.maxPercent}%</span>,
    },
    {
      key: 'warn',
      header: 'Warn %',
      align: 'right',
      render: (r) => <span className="tabular-nums text-slate-500">{r.warnPercent ?? '—'}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r.priority}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Most-specific rule wins: product + tier &gt; category + tier &gt; tier &gt; category &gt; default.
        </p>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create discount rule</DialogTitle>
              <DialogDescription>Higher priority overrides lower.</DialogDescription>
            </DialogHeader>
            <DiscountRuleForm
              categories={categories ?? []}
              onSubmit={(v) => createMut.mutate(v)}
              submitting={createMut.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No discount rules"
        emptyDescription="Create tier/category/product ceilings used by the risk engine."
      />
    </div>
  );
}

function DiscountRuleForm({
  categories,
  onSubmit,
  submitting,
}: {
  categories: any[];
  onSubmit: (v: Record<string, unknown>) => void;
  submitting?: boolean;
}) {
  const [name, setName] = useState('');
  const [customerTier, setCustomerTier] = useState('GOLD');
  const [categoryId, setCategoryId] = useState('');
  const [maxPercent, setMaxPercent] = useState('10');
  const [warnPercent, setWarnPercent] = useState('5');
  const [priority, setPriority] = useState('0');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          customerTier: customerTier || undefined,
          categoryId: categoryId || undefined,
          maxPercent: parseInt(maxPercent, 10),
          warnPercent: warnPercent ? parseInt(warnPercent, 10) : undefined,
          priority: parseInt(priority, 10) || 0,
          active: true,
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="dr-name">Name</Label>
        <Input id="dr-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dr-tier">Customer tier</Label>
          <Select value={customerTier} onValueChange={setCustomerTier}>
            <SelectTrigger id="dr-tier">
              <SelectValue placeholder="Any tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any tier</SelectItem>
              <SelectItem value="BRONZE">Bronze</SelectItem>
              <SelectItem value="SILVER">Silver</SelectItem>
              <SelectItem value="GOLD">Gold</SelectItem>
              <SelectItem value="PLATINUM">Platinum</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-cat">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="dr-cat">
              <SelectValue placeholder="Any category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dr-max">Max %</Label>
          <Input id="dr-max" type="number" min="0" max="100" value={maxPercent} onChange={(e) => setMaxPercent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-warn">Warn %</Label>
          <Input id="dr-warn" type="number" min="0" max="100" value={warnPercent} onChange={(e) => setWarnPercent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-prio">Priority</Label>
          <Input id="dr-prio" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Creating…' : 'Create rule'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Risk config
// ──────────────────────────────────────────────────────────────────────────

function RiskConfigTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['risk-config'],
    queryFn: async () => (await fetch('/api/risk-config')).json(),
  });

  const saveMut = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch('/api/risk-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Risk config saved.');
      qc.invalidateQueries({ queryKey: ['risk-config'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }
  return <RiskConfigForm initial={data} saving={saveMut.isPending} onSave={(v) => saveMut.mutate(v)} />;
}

const RISK_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'safeMax', label: 'SAFE max', hint: 'Below this → auto-approve' },
  { key: 'reviewMax', label: 'REVIEW max', hint: 'Above safe, below review' },
  { key: 'managerMax', label: 'MANAGER max', hint: 'Above review → MANAGER band' },
  { key: 'marginFactorLow', label: 'Margin factor (low) bp', hint: 'Multiplier on low-margin lines' },
  { key: 'marginFactorHigh', label: 'Margin factor (high) bp', hint: 'Multiplier on high-margin lines' },
  { key: 'marginLowThreshold', label: 'Low-margin threshold %', hint: 'Below this % margin is "low"' },
  { key: 'revenueConcentrationThreshold', label: 'Revenue concentration %', hint: 'Line > X% of total triggers penalty' },
  { key: 'multiViolationPenalty', label: 'Multi-violation penalty', hint: 'Multiple lines violating' },
  { key: 'highRevenuePenalty', label: 'High-revenue penalty', hint: 'Concentration penalty' },
  { key: 'lowMarginPenalty', label: 'Low-margin penalty', hint: 'Margin deterioration penalty' },
  { key: 'negotiationEscalationPenalty', label: 'Negotiation escalation penalty', hint: 'Customer repeatedly raising discounts' },
  { key: 'totalDiscountPenalty', label: 'Total-discount penalty', hint: 'Above total discount threshold' },
  { key: 'totalDiscountThreshold', label: 'Total-discount threshold %', hint: 'Penalty applies above this %' },
  { key: 'minDenominator', label: 'Min denominator (pp)', hint: 'Div-by-zero guard' },
];

function RiskConfigForm({
  initial,
  onSave,
  saving,
}: {
  initial: any;
  onSave: (v: any) => void;
  saving?: boolean;
}) {
  const [config, setConfig] = useState<any>(initial);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Thresholds are configuration, not hardcoded constants. The risk engine reads this row on every quote submission.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RISK_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs font-medium">{f.label}</Label>
            <Input
              type="number"
              value={config[f.key] ?? 0}
              onChange={(e) =>
                setConfig((c: any) => ({ ...c, [f.key]: parseInt(e.target.value, 10) || 0 }))
              }
            />
            <p className="text-[11px] text-slate-500">{f.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(config)} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save thresholds'}
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Approval chains
// ──────────────────────────────────────────────────────────────────────────

interface ApprovalChainRow {
  id: string;
  name: string;
  triggerBand: string;
  active: boolean;
  steps: { id: string; order: number; requiredRole: string; approverId: string | null }[];
}

function ApprovalChainsTab() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const { data, isLoading } = useQuery<ApprovalChainRow[]>({
    queryKey: ['approval-chains'],
    queryFn: async () => (await fetch('/api/approval-chains')).json(),
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/approval-chains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Approval chain created.');
      qc.invalidateQueries({ queryKey: ['approval-chains'] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          A chain activates when a quote&apos;s risk band ≥ trigger band.
        </p>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New chain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create approval chain</DialogTitle>
            </DialogHeader>
            <ApprovalChainForm onSubmit={(v) => createMut.mutate(v)} submitting={createMut.isPending} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3">
        {(data ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-amber-700">
                    Trigger: {c.triggerBand}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              <div className="flex flex-wrap gap-2">
                {c.steps.length === 0 && (
                  <p className="text-xs text-slate-500">No steps defined yet.</p>
                )}
                {c.steps.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {s.requiredRole.replace('_', ' ')}
                      </span>
                    </div>
                    {i < c.steps.length - 1 && <span className="text-slate-400">→</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            No approval chains yet. Phase 07 will pick the right chain based on risk band.
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalChainForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (v: Record<string, unknown>) => void;
  submitting?: boolean;
}) {
  const [name, setName] = useState('');
  const [triggerBand, setTriggerBand] = useState('REVIEW');
  const [steps, setSteps] = useState([
    { order: 1, requiredRole: 'SALES_MANAGER', approverId: '' },
  ]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          triggerBand,
          active: true,
          steps: steps.map((s) => ({
            order: s.order,
            requiredRole: s.requiredRole,
            approverId: s.approverId || undefined,
          })),
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ac-name">Name</Label>
          <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ac-trigger">Trigger band</Label>
          <Select value={triggerBand} onValueChange={setTriggerBand}>
            <SelectTrigger id="ac-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAFE">Safe</SelectItem>
              <SelectItem value="REVIEW">Review</SelectItem>
              <SelectItem value="MANAGER">Manager</SelectItem>
              <SelectItem value="FINANCE">Finance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Steps (in order)</Label>
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {s.order}
            </span>
            <Select
              value={s.requiredRole}
              onValueChange={(v) =>
                setSteps((arr) => arr.map((x, idx) => (idx === i ? { ...x, requiredRole: v } : x)))
              }
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SALES_MANAGER">Sales Manager</SelectItem>
                <SelectItem value="FINANCE_OPERATIONS">Finance/Operations</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            {steps.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSteps((arr) => arr.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, order: idx + 1 })))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setSteps((arr) => [...arr, { order: arr.length + 1, requiredRole: 'FINANCE_OPERATIONS', approverId: '' }])
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Add step
        </Button>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Creating…' : 'Create chain'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Warehouses
// ──────────────────────────────────────────────────────────────────────────

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  region: string | null;
  shippingCostCents: number;
  active: boolean;
  _count: { stock: number };
}

function WarehousesTab() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const { data, isLoading } = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await fetch('/api/warehouses')).json(),
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/warehouses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Warehouse created.');
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [region, setRegion] = useState('');
  const [shippingCost, setShippingCost] = useState('0');

  const columns: Column<WarehouseRow>[] = [
    {
      key: 'name',
      header: 'Warehouse',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.name}</span>
          <span className="text-xs text-slate-500">{r.code}</span>
        </div>
      ),
    },
    { key: 'region', header: 'Region', render: (r) => <span className="text-sm">{r.region ?? '—'}</span> },
    {
      key: 'shipping',
      header: 'Shipping cost',
      align: 'right',
      render: (r) => <span className="tabular-nums">{formatCurrency(r.shippingCostCents)}</span>,
    },
    {
      key: 'skus',
      header: 'SKUs in stock',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r._count.stock}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Warehouses + stock are used by the Phase 09 optimizer to split allocations.
        </p>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New warehouse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create warehouse</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  name,
                  code,
                  region: region || undefined,
                  shippingCostCents: fromDecimal(parseFloat(shippingCost) || 0),
                  active: true,
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="w-name">Name</Label>
                  <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-code">Code</Label>
                  <Input id="w-code" value={code} onChange={(e) => setCode(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="w-region">Region</Label>
                  <Input id="w-region" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-ship">Shipping cost</Label>
                  <Input
                    id="w-ship"
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending || !name.trim() || !code.trim()}>
                  {createMut.isPending ? 'Creating…' : 'Create warehouse'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No warehouses"
        emptyDescription="Add warehouses + stock to enable fulfillment optimization."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Subscription plans
// ──────────────────────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  name: string;
  interval: string;
  intervalCount: number;
  priceCents: number;
  active: boolean;
}

function SubscriptionPlansTab() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const { data, isLoading } = useQuery<PlanRow[]>({
    queryKey: ['subscription-plans'],
    queryFn: async () => (await fetch('/api/subscription-plans')).json(),
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/subscription-plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Plan created.');
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState('');
  const [interval, setInterval] = useState('MONTHLY');
  const [intervalCount, setIntervalCount] = useState('1');
  const [price, setPrice] = useState('100.00');

  const columns: Column<PlanRow>[] = [
    { key: 'name', header: 'Plan', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'interval',
      header: 'Interval',
      render: (r) => (
        <span className="text-sm capitalize">
          {r.intervalCount > 1 ? `Every ${r.intervalCount} ` : 'Every '}
          {r.interval.toLowerCase().replace(/y$/, '')}
          {r.intervalCount > 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price per cycle',
      align: 'right',
      render: (r) => <span className="tabular-nums">{formatCurrency(r.priceCents)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Subscription plan templates used by Phase 10 (billing).
        </p>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create subscription plan</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  name,
                  interval,
                  intervalCount: parseInt(intervalCount, 10) || 1,
                  priceCents: fromDecimal(parseFloat(price) || 0),
                  active: true,
                });
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="sp-name">Name</Label>
                <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-int">Interval</Label>
                  <Select value={interval} onValueChange={setInterval}>
                    <SelectTrigger id="sp-int">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-count">Count</Label>
                  <Input
                    id="sp-count"
                    type="number"
                    min="1"
                    value={intervalCount}
                    onChange={(e) => setIntervalCount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-price">Price</Label>
                  <Input
                    id="sp-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending || !name.trim()}>
                  {createMut.isPending ? 'Creating…' : 'Create plan'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No subscription plans"
        emptyDescription="Plans are used by recurring billing in Phase 10."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Price lists
// ──────────────────────────────────────────────────────────────────────────

interface PriceListRow {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  active: boolean;
  _count: { items: number };
}

function PriceListsTab() {
  const { data, isLoading } = useQuery<PriceListRow[]>({
    queryKey: ['price-lists'],
    queryFn: async () => (await fetch('/api/price-lists')).json(),
  });

  const columns: Column<PriceListRow>[] = [
    {
      key: 'name',
      header: 'List',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {r.isDefault && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              Default
            </span>
          )}
        </div>
      ),
    },
    { key: 'currency', header: 'Currency', render: (r) => <span className="text-sm">{r.currency}</span> },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r._count.items}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Price lists override the product list price per customer. Items are added per-list in Phase 04 details.
      </p>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No price lists"
        emptyDescription="Create price lists to give specific customers custom pricing."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Demo data
// ──────────────────────────────────────────────────────────────────────────

import { Rocket, CheckCircle2, DatabaseZap, Download, FileArchive } from 'lucide-react';

function DemoDataTab() {
  const qc = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const seedMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/seed', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Seed failed');
      return res.json();
    },
    onSuccess: (json) => {
      setResult(json.result);
      toast.success('Demo data seeded.');
      // Invalidate every list query so all views refresh.
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/seed/bulk', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Bulk seed failed');
      return res.json();
    },
    onSuccess: (json) => {
      setBulkResult(json.counts);
      toast.success(`Bulk data generated: ${json.counts.total} records.`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Rocket className="h-4 w-4 text-emerald-600" />
            Deterministic demo seed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Seeds the complete flagship demo: 4 categories, 8 products,
            3 warehouses (with stock set to force a split), 3 customers
            (Acme Gold / Beta Silver / Nova Bronze), 5 demo users with
            password <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">dealflow360</code>,
            6 discount rules (the flagship Gold · Hardware 15%, Gold · Services 10%),
            3 approval chains, 3 subscription plans, product associations,
            purchase history, and 5 historical quotes in various states.
          </p>
          <p className="text-xs text-slate-500">
            Idempotent — safe to call repeatedly. Existing records are
            updated in place; nothing is deleted.
          </p>
          <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            {seedMut.isPending ? 'Seeding…' : 'Seed demo data'}
          </Button>
          {result && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Seed complete
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {Object.entries(result).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded bg-white/60 px-2 py-1 dark:bg-slate-900/60">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold tabular-nums">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DatabaseZap className="h-4 w-4 text-violet-600" />
            Bulk random test data (~200 records)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Generates ~200 random test records to populate the dashboard with
            realistic volume: 20 random customers (mixed tiers, assigned to
            random sales reps), 100 random quotes (with 1-4 lines each,
            mixed statuses, random discounts — some breaching ceilings),
            50 random invoices (across DRAFT/ISSUED/PAID/PARTIAL/OVERDUE/
            VOID with payments), 30 random subscriptions (ACTIVE/CANCELLED),
            plus approval requests and health alerts for visual variety.
          </p>
          <p className="text-xs text-slate-500">
            Temporary — each call appends new records (BULK-year-NNNN for
            quotes, INV-year-BNNNN for invoices). Safe to call multiple
            times for higher volume. Requires the demo seed to exist first
            (it uses the seeded products, reps, and discount rules).
          </p>
          <Button
            onClick={() => bulkMut.mutate()}
            disabled={bulkMut.isPending}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {bulkMut.isPending ? 'Generating…' : 'Generate 200 random records'}
          </Button>
          {bulkResult && (
            <div className="mt-4 rounded-md border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-400">
                <CheckCircle2 className="h-4 w-4" />
                Bulk generation complete · {bulkResult.total} total records
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {Object.entries(bulkResult).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded bg-white/60 px-2 py-1 dark:bg-slate-900/60">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold tabular-nums">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-sky-200 bg-sky-50/30 dark:border-sky-900 dark:bg-sky-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileArchive className="h-4 w-4 text-sky-600" />
            Download Source Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Download the complete DealFlow360 source code as a ZIP archive.
            Includes all 353 source files: domain engines, application
            services, API routes, React components, Prisma schema, SQL
            schemas (main + temp database), docs, and config files.
          </p>
          <p className="text-xs text-slate-500">
            381 KB compressed · 1.16 MB uncompressed · Excludes
            node_modules, build artifacts, and database files. Run
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">bun install</code>
            then
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">bun run db:push</code>
            after extracting.
          </p>
          <a
            href="/dealflow360-source.zip"
            download="dealflow360-source.zip"
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
          >
            <Download className="h-4 w-4" />
            Download dealflow360-source.zip (381 KB)
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
