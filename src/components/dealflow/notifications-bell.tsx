'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, CheckCheck, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewStore } from '@/store/view-store';
import { toast } from 'sonner';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_TONES: Record<string, string> = {
  'approval.requested': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'approval.decision': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  'health.alert': 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  'negotiation.received': 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  'negotiation.decision': 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
};

export function NotificationsBell() {
  const qc = useQueryClient();
  const setView = useViewStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const { data, isLoading, refetch } = useQuery<{ data: NotificationRow[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 15_000, // poll every 15s (was 30s) for snappier toasts
    refetchOnWindowFocus: true,
  });

  // Fire a toast for each newly-arrived notification (only after first load).
  useEffect(() => {
    if (!data?.data) return;
    if (isFirstLoadRef.current) {
      // First load: just record existing IDs without toasting.
      data.data.forEach((n) => knownIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
      return;
    }
    // Subsequent loads: fire a toast for each unseen notification.
    const fresh = data.data.filter((n) => !knownIdsRef.current.has(n.id));
    if (fresh.length > 0) {
      fresh.forEach((n) => {
        knownIdsRef.current.add(n.id);
        const tone = TYPE_TONES[n.type] ?? 'bg-slate-100 text-slate-600';
        toast(n.title, {
          description: n.body ?? undefined,
          duration: 6000,
          action: n.link
            ? {
                label: 'View',
                onClick: () => {
                  const viewMap: Record<string, any> = {
                    approvals: 'approvals',
                    quotes: 'quotes',
                    negotiations: 'negotiations',
                    billing: 'billing',
                    dashboard: 'dashboard',
                  };
                  setView(viewMap[n.link!] ?? 'dashboard');
                },
              }
            : undefined,
        });
      });
    }
  }, [data, setView]);

  const markReadMut = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    },
    onSuccess: () => {
      toast.success('All notifications marked as read.');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unread = data?.unreadCount ?? 0;
  const notifications = data?.data ?? [];

  const handleClick = (n: NotificationRow) => {
    if (!n.read) markReadMut.mutate(n.id);
    if (n.link) {
      // Map link string to a view.
      const viewMap: Record<string, any> = {
        approvals: 'approvals',
        quotes: 'quotes',
        negotiations: 'negotiations',
        billing: 'billing',
        dashboard: 'dashboard',
      };
      setView(viewMap[n.link] ?? 'dashboard');
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) refetch();
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 sm:w-96"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unread > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {unread} unread
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                You're all caught up
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                New notifications will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60',
                      !n.read && 'bg-rose-50/40 dark:bg-rose-950/10',
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                      TYPE_TONES[n.type] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}>
                      {n.type.split('.')[0]?.[0]?.toUpperCase() ?? '•'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-sm leading-tight',
                          !n.read ? 'font-semibold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300',
                        )}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
