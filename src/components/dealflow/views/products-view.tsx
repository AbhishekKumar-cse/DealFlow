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
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/dealflow/data-table';
import { formatCurrency, fromDecimal } from '@/lib/money';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  billingType: string;
  listPriceCents: number;
  costCents: number | null;
  active: boolean;
  category: { id: string; name: string };
}

interface CategoryRow {
  id: string;
  name: string;
}

export function ProductsView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openCreate, setOpenCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const q = search ? `&search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/products?page=1&pageSize=50${q}`);
      const json = await res.json();
      return json.data as ProductRow[];
    },
  });

  const { data: categories } = useQuery<CategoryRow[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create product');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Product created.');
      qc.invalidateQueries({ queryKey: ['products'] });
      setOpenCreate(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900 dark:text-slate-100">{row.name}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{row.sku}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span className="text-sm text-slate-700 dark:text-slate-300">{row.category?.name ?? '—'}</span>
      ),
    },
    {
      key: 'billingType',
      header: 'Billing',
      render: (row) => (
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {row.billingType.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (row) =>
        row.costCents != null ? (
          <span className="tabular-nums text-slate-500">{formatCurrency(row.costCents)}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'listPrice',
      header: 'List price',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium">{formatCurrency(row.listPriceCents)}</span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      render: (row) => {
        if (row.costCents == null) return <span className="text-xs text-slate-400">—</span>;
        const marginPct = Math.max(
          0,
          Math.round((1 - row.costCents / Math.max(1, row.listPriceCents)) * 100),
        );
        return (
          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{marginPct}%</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Products</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Catalog with categories, cost, list price and billing type.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9"
            />
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create product</DialogTitle>
                <DialogDescription>
                  List price is the default. Price-list overrides arrive in Phase 04 pricing.
                </DialogDescription>
              </DialogHeader>
              <ProductForm
                categories={categories ?? []}
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
        emptyTitle="No products yet"
        emptyDescription="Create products to start quoting."
      />
    </div>
  );
}

interface ProductFormProps {
  categories: CategoryRow[];
  onSubmit: (v: Record<string, unknown>) => void;
  submitting?: boolean;
}

function ProductForm({ categories, onSubmit, submitting }: ProductFormProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [listPrice, setListPrice] = useState('100.00');
  const [cost, setCost] = useState('');
  const [billingType, setBillingType] = useState('ONE_TIME');
  const [defaultInterval, setDefaultInterval] = useState('MONTHLY');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          sku,
          description: description || undefined,
          categoryId,
          listPriceCents: fromDecimal(parseFloat(listPrice) || 0),
          costCents: cost ? fromDecimal(parseFloat(cost)) : undefined,
          billingType,
          defaultInterval: billingType === 'RECURRING' ? defaultInterval : undefined,
          defaultIntervalCount: billingType === 'RECURRING' ? 1 : undefined,
          active: true,
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-sku">SKU</Label>
          <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="p-category">
              <SelectValue placeholder="Pick category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-desc">Description</Label>
        <Textarea
          id="p-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-list">List price</Label>
          <Input
            id="p-list"
            type="number"
            step="0.01"
            min="0"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-cost">Cost (optional)</Label>
          <Input
            id="p-cost"
            type="number"
            step="0.01"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-billing">Billing type</Label>
          <Select value={billingType} onValueChange={setBillingType}>
            <SelectTrigger id="p-billing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONE_TIME">One-time</SelectItem>
              <SelectItem value="RECURRING">Recurring</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {billingType === 'RECURRING' && (
          <div className="space-y-1.5">
            <Label htmlFor="p-interval">Default interval</Label>
            <Select value={defaultInterval} onValueChange={setDefaultInterval}>
              <SelectTrigger id="p-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="ANNUAL">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting || !name.trim() || !sku.trim() || !categoryId}>
          {submitting ? 'Creating…' : 'Create product'}
        </Button>
      </DialogFooter>
    </form>
  );
}
