'use client';

import { useSessionStore } from '@/store/session-store';
import { useViewStore, type DealView } from '@/store/view-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { NotificationsBell } from '@/components/dealflow/notifications-bell';
import { CommandPalette } from '@/components/dealflow/command-palette';

const VIEW_TITLES: Record<DealView, string> = {
  dashboard: 'Dashboard',
  quotes: 'Quotes',
  'quote-detail': 'Quote Detail',
  approvals: 'Approvals',
  fulfillment: 'Fulfillment',
  billing: 'Billing',
  customers: 'Customers',
  products: 'Products',
  settings: 'Settings',
  audit: 'Audit Trail',
  portal: 'My Quotes',
  negotiations: 'Negotiations',
  registrations: 'Registered Users',
  'register-data': 'Register Data DB',
};

export function Header() {
  const user = useSessionStore((s) => s.user);
  const view = useViewStore((s) => s.view);

  return (
    <header
      className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {VIEW_TITLES[view] ?? 'DealFlow360'}
        </h1>
        {user && (
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {user.role.replace('_', ' ').toLowerCase()}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette />
        <NotificationsBell />
      </div>
    </header>
  );
}
