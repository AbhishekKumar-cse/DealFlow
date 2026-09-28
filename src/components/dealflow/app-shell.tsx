'use client';

import { Sidebar } from '@/components/dealflow/sidebar';
import { Header } from '@/components/dealflow/header';
import { useViewStore, type DealView } from '@/store/view-store';
import { useSessionStore } from '@/store/session-store';
import { cn } from '@/lib/utils';
import { DashboardView } from '@/components/dealflow/views/dashboard-view';
import { QuotesView } from '@/components/dealflow/views/quotes-view';
import { ApprovalsView } from '@/components/dealflow/views/approvals-view';
import { FulfillmentView } from '@/components/dealflow/views/fulfillment-view';
import { BillingView } from '@/components/dealflow/views/billing-view';
import { CustomersView } from '@/components/dealflow/views/customers-view';
import { ProductsView } from '@/components/dealflow/views/products-view';
import { SettingsView } from '@/components/dealflow/views/settings-view';
import { AuditView } from '@/components/dealflow/views/audit-view';
import { PortalView } from '@/components/dealflow/views/portal-view';
import { NegotiationsView } from '@/components/dealflow/views/negotiations-view';
import { QuoteDetailView } from '@/components/dealflow/views/quote-detail-view';
import { RegistrationsView } from '@/components/dealflow/views/registrations-view';
import { RegisterDataView } from '@/components/dealflow/views/register-data-view';
import { SignInScreen } from '@/components/dealflow/sign-in-screen';

const VIEW_COMPONENTS: Record<DealView, React.ComponentType> = {
  dashboard: DashboardView,
  quotes: QuotesView,
  'quote-detail': QuoteDetailView,
  approvals: ApprovalsView,
  fulfillment: FulfillmentView,
  billing: BillingView,
  customers: CustomersView,
  products: ProductsView,
  settings: SettingsView,
  audit: AuditView,
  portal: PortalView,
  negotiations: NegotiationsView,
  registrations: RegistrationsView,
  'register-data': RegisterDataView,
};

export function AppShell() {
  const view = useViewStore((s) => s.view);
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm">Loading DealFlow360…</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <SignInScreen />;
  }

  const ViewComponent = VIEW_COMPONENTS[view] ?? DashboardView;

  return (
    <div className="flex min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main
          className={cn(
            'flex-1 overflow-y-auto p-6',
            'bg-gradient-to-br from-slate-50 via-white to-slate-100/50',
            'dark:from-slate-950 dark:via-slate-950 dark:to-slate-900',
          )}
          role="main"
        >
          <ViewComponent />
        </main>
        <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          DealFlow360 · B2B Sales Operations Platform · Quotation → Risk → Approval → Fulfillment → Billing → Audit
        </footer>
      </div>
    </div>
  );
}
