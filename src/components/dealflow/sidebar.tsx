'use client';

import { useViewStore, type DealView } from '@/store/view-store';
import { useSessionStore, type Role } from '@/store/session-store';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
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
  UserRound,
  LogOut,
  UserCheck,
  DatabaseZap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface NavItem {
  view: DealView;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  customerOnly?: boolean;
}

const INTERNAL_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'quotes', label: 'Quotes', icon: FileText },
  { view: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { view: 'fulfillment', label: 'Fulfillment', icon: Truck },
  { view: 'billing', label: 'Billing', icon: Receipt },
  { view: 'customers', label: 'Customers', icon: Users },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'negotiations', label: 'Negotiations', icon: MessageSquare },
  { view: 'audit', label: 'Audit Trail', icon: ScrollText },
  { view: 'registrations', label: 'Registrations', icon: UserCheck },
  { view: 'register-data', label: 'Register Data', icon: DatabaseZap },
  { view: 'settings', label: 'Settings', icon: Settings },
];

const CUSTOMER_NAV: NavItem[] = [
  { view: 'portal', label: 'My Quotes', icon: FileText, customerOnly: true },
  { view: 'negotiations', label: 'Negotiations', icon: MessageSquare, customerOnly: true },
];

export function Sidebar() {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const user = useSessionStore((s) => s.user);
  const signOutLocal = useSessionStore((s) => s.signOut);

  const isCustomer = user?.role === 'CUSTOMER';
  const items = isCustomer ? CUSTOMER_NAV : INTERNAL_NAV;

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    signOutLocal();
    toast.success('Signed out.');
  };

  return (
    <aside
      className={cn(
        'flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 backdrop-blur-sm',
        'dark:border-slate-800 dark:bg-slate-950/40',
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm">
          D360
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            DealFlow360
          </span>
          <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Deal Lifecycle OS
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100',
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-emerald-500 dark:bg-emerald-400" />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform group-hover:scale-110',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200',
                )}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-md bg-white p-2.5 shadow-sm dark:bg-slate-900">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            {user?.name?.[0]?.toUpperCase() ?? <UserRound className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {user?.name ?? 'Not signed in'}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {user ? formatRole(user.role) : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function formatRole(role: Role): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
