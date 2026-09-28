'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session-store';
import { useViewStore } from '@/store/view-store';

/** Hydrates the Zustand session store from the server session endpoint. */
function SessionHydrator() {
  const setUser = useSessionStore((s) => s.setUser);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setView = useViewStore((s) => s.setView);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (cancelled) return;
        if (data?.user) {
          setUser(data.user);
          setStatus('authenticated');
          // All roles land on the dashboard — it is role-aware and renders
          // the customer-scoped view (limited KPIs + recent-quotes summary,
          // no internal charts) for CUSTOMER. Customers can navigate to the
          // full portal list via the "My Quotes" sidebar item.
          setView('dashboard');
        } else {
          setUser(null);
          setStatus('unauthenticated');
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser, setStatus, setView]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <SessionHydrator />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
