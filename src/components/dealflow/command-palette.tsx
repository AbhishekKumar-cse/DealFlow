'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LayoutDashboard,
  FileText,
  CheckCircle2,
  Truck,
  Receipt,
  Users,
  Package,
  Settings,
  ScrollText,
  MessageSquare,
  Search,
  UserCheck,
  DatabaseZap,
  type LucideIcon,
} from 'lucide-react';
import { useViewStore, type DealView } from '@/store/view-store';
import { useSessionStore } from '@/store/session-store';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  view: DealView;
  icon: LucideIcon;
  keywords: string[];
}

const ALL_COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Overview', view: 'dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'kpi'] },
  { id: 'quotes', label: 'Quotes', hint: 'All quotes', view: 'quotes', icon: FileText, keywords: ['quote', 'deal', 'proposal'] },
  { id: 'approvals', label: 'Approvals', hint: 'Pending approvals', view: 'approvals', icon: CheckCircle2, keywords: ['approve', 'reject', 'review'] },
  { id: 'fulfillment', label: 'Fulfillment', hint: 'Warehouse allocations', view: 'fulfillment', icon: Truck, keywords: ['warehouse', 'stock', 'ship'] },
  { id: 'billing', label: 'Billing', hint: 'Invoices + subscriptions', view: 'billing', icon: Receipt, keywords: ['invoice', 'payment', 'subscription', 'recurring'] },
  { id: 'customers', label: 'Customers', hint: 'Organizations', view: 'customers', icon: Users, keywords: ['client', 'org'] },
  { id: 'products', label: 'Products', hint: 'Catalog', view: 'products', icon: Package, keywords: ['item', 'sku', 'price'] },
  { id: 'negotiations', label: 'Negotiations', hint: 'Customer counter-offers', view: 'negotiations', icon: MessageSquare, keywords: ['negotiate', 'counter', 'proposal'] },
  { id: 'audit', label: 'Audit Trail', hint: 'Immutable log', view: 'audit', icon: ScrollText, keywords: ['log', 'history', 'event'] },
  { id: 'registrations', label: 'Registrations', hint: 'User sign-up details (logic_details_db)', view: 'registrations', icon: UserCheck, keywords: ['register', 'signup', 'sign-up', 'user', 'login', 'account', 'logic_details'] },
  { id: 'register-data', label: 'Register Data DB', hint: 'New register_data_db (3 tables + activity + audit)', view: 'register-data', icon: DatabaseZap, keywords: ['register', 'signup', 'register_data', 'database', 'activity', 'audit log'] },
  { id: 'settings', label: 'Settings', hint: 'Configuration', view: 'settings', icon: Settings, keywords: ['config', 'discount', 'risk', 'warehouse'] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const setView = useViewStore((s) => s.setView);
  const user = useSessionStore((s) => s.user);

  // Global Cmd+K / Ctrl+K shortcut.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Filter commands by role.
  const isCustomer = user?.role === 'CUSTOMER';
  const commands = useMemo(() => {
    return ALL_COMMANDS.filter((c) => {
      if (isCustomer) return c.view === 'portal' || c.view === 'negotiations';
      return c.view !== 'portal';
    }).map((c) => c.view === 'portal' ? { ...c, label: 'My Quotes', hint: 'Your organization' } : c);
  }, [isCustomer]);

  // Filter by query.
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.hint.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.includes(q)),
    );
  }, [query, commands]);

  // Keep activeIndex in bounds without a separate effect.
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  const execute = (item: CommandItem) => {
    setView(item.view);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800 md:flex"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="ml-2 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 md:hidden"
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0 sm:top-[20%]">
          <DialogHeader className="sr-only">
            <DialogTitle>Command palette</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered[safeActiveIndex]) execute(filtered[safeActiveIndex]);
                }
              }}
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              ESC
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No matching commands.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => execute(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                          i === safeActiveIndex
                            ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                        )}
                      >
                        <Icon className={cn(
                          'h-4 w-4 shrink-0',
                          i === safeActiveIndex
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400',
                        )} />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            {item.hint}
                          </span>
                        </div>
                        {i === safeActiveIndex && (
                          <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                            ↵
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
