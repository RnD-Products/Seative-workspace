'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, AtSign, Bell, BriefcaseBusiness, CheckCheck, Inbox, MessageSquare, OctagonAlert, UserPlus, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/misc';
import { RelTime } from '@/components/rel-time';
import { cn } from '@/lib/utils';
import { listNotifications, markAllRead, markRead, unreadCount, type NotificationItem } from '@/app/actions/notifications';

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  task_assigned: BriefcaseBusiness, project_added: UserPlus, incoming_project: Inbox, team_assigned: Users,
  deadline_reminder: AlarmClock, blocker: OctagonAlert, mention: MessageSquare, message: MessageSquare, chat_mention: AtSign, chat_message: MessageSquare,
};

export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  // Keep the count fresh while the app is open.
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') unreadCount().then(setUnread).catch(() => {}); }, 60_000);
    return () => window.clearInterval(t);
  }, []);
  const load = useCallback(() => start(async () => { const r = await listNotifications(); setItems(r.items); setUnread(r.unread); }), []);

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong" title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="size-4" aria-hidden />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unread > 0 && (
            <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ai hover:bg-primary-soft"
              onClick={() => start(async () => { await markAllRead(); setUnread(0); setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null); })}>
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items === null ? (
            <div className="grid place-items-center py-8"><Spinner className="text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button className={cn('flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]', !n.read_at && 'bg-primary-soft/60')}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read_at) { setUnread((u) => Math.max(0, u - 1)); void markRead(n.id); }
                        if (n.link) router.push(n.link);
                      }}>
                      <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border', n.kind === 'deadline_reminder' ? 'border-deadline/30 bg-deadline-soft text-deadline' : n.kind === 'blocker' ? 'border-destructive/30 bg-destructive-soft text-destructive' : 'border-border-strong bg-muted text-muted-foreground')}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
                        {n.body && <span className="block truncate text-[12px] text-muted-foreground">{n.body}</span>}
                        <span className="block text-[11.5px] text-muted-foreground"><RelTime iso={n.created_at} /></span>
                      </span>
                      {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {pending && items !== null && <div className="border-t px-3 py-1.5 text-[11.5px] text-muted-foreground">Updating…</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
