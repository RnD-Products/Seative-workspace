'use client';
import { Toaster } from './ui/toast';
import { Shortcuts } from './shortcuts';
import { NotificationsBell } from './notifications-bell';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ChevronDown, Clock3, FolderKanban, Inbox, Keyboard, MessagesSquare, OctagonAlert, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react';
import { cn, APP_NAME } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/domain';
import type { Role, RunningTimer } from '@/lib/types';
import { RunningTimerPill } from './time/running-timer';
import { Avatar } from './badges';
import { ThemeToggle } from './theme-toggle';
import { CommandPalette, type PaletteProject } from './command-palette';
import { Button } from './ui/button';
import { signOut } from '@/app/actions/auth';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; tone?: 'red' | 'primary' };

/** Each role sees only the places that are useful to it. */
function navFor(role: Role, incoming: number, blockers: number, chats: number): NavItem[] {
  const messages: NavItem = { href: '/messages', label: 'Messages', icon: MessagesSquare, badge: chats, tone: 'primary' };
  const overview = { href: '/', label: 'Overview', icon: LayoutDashboard };
  const settings = { href: '/settings', label: 'Settings', icon: Settings };
  if (role === 'sales') return [overview, { href: '/projects', label: 'Deals', icon: FolderKanban }, messages, settings];
  const base: NavItem[] = [overview, { href: '/my-work', label: 'My Work', icon: ListChecks }, { href: '/projects', label: 'Projects', icon: FolderKanban }, messages];
  if (role === 'pm' || role === 'ceo') base.push({ href: '/incoming', label: 'Incoming', icon: Inbox, badge: incoming }, { href: '/blockers', label: 'Blockers', icon: OctagonAlert, badge: blockers, tone: 'red' }, { href: '/reports', label: 'Reports', icon: BarChart3 });
  return [...base, { href: '/team', label: 'Team', icon: Users }, settings];
}

export function AppShell({ user, orgName, projects, canCreate, timer, unread, incoming, blockers, chats, children }: {
  user: { id: string; full_name: string; role: Role }; orgName: string; projects: PaletteProject[]; canCreate: boolean; timer: RunningTimer | null;
  unread: number; incoming: number; blockers: number; chats: number; children: React.ReactNode;
}) {
  const nav = navFor(user.role, incoming, blockers, chats);
  const createHref = user.role === 'sales' ? '/deals/new' : canCreate ? '/projects/new' : null;
  const createLabel = user.role === 'sales' ? 'New deal' : 'New project';
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [help, setHelp] = useState(false);
  const openSearch = useCallback(() => setPalette(true), []);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)) || (href === '/projects' && pathname.startsWith('/tasks'));

  const [projectsOpen, setProjectsOpen] = useState(true);

  // Icon rail (desktop): one icon per place, with a tooltip and a small count when something waits.
  const rail = (
    <div className="flex h-full w-[60px] flex-col items-center gap-1 border-r bg-shell py-3">
      <Link href="/" className="mb-3 grid size-9 place-items-center rounded-[10px] bg-foreground text-[15px] font-bold text-background" title={orgName}>S</Link>
      <nav aria-label="Main" className="flex flex-col items-center gap-1">
        {nav.map(({ href, label, icon: Icon, badge, tone }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} aria-label={label}
            className={cn('group relative grid size-9 place-items-center rounded-[10px] text-ink-foreground transition-colors hover:bg-foreground/[0.07] hover:text-ink-strong', isActive(href) && 'bg-foreground/[0.1] text-ink-strong')}>
            <Icon className="size-[18px]" aria-hidden />
            {badge ? <span className={cn('absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-shell', tone === 'red' ? 'bg-destructive' : tone === 'primary' ? 'bg-ai' : 'bg-deadline')}>{badge}</span> : null}
            <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-[12px] text-foreground opacity-0 shadow-lift transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>
          </Link>
        ))}
        {user.role !== 'sales' && (
          <Link href="/ask" aria-label="Ask about work" aria-current={pathname === '/ask' ? 'page' : undefined}
            className={cn('group relative grid size-9 place-items-center rounded-[10px] text-ai hover:bg-foreground/[0.07]', pathname === '/ask' && 'bg-foreground/[0.1]')}>
            <Sparkles className="size-[18px]" aria-hidden />
            <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-[12px] text-foreground opacity-0 shadow-lift transition-opacity group-hover:opacity-100">Ask about work</span>
          </Link>
        )}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1">
        <NotificationsBell initialUnread={unread} />
        <button onClick={() => setHelp(true)} className="grid size-9 place-items-center rounded-[10px] text-ink-foreground hover:bg-foreground/[0.07] hover:text-ink-strong" title="Keyboard shortcuts (?)">
          <Keyboard className="size-[18px]" aria-hidden /><span className="sr-only">Keyboard shortcuts</span>
        </button>
        <ThemeToggle className="size-9 rounded-[10px]" />
        <form action={signOut}>
          <button type="submit" className="grid size-9 place-items-center rounded-[10px] text-ink-foreground hover:bg-foreground/[0.07] hover:text-ink-strong" title="Sign out">
            <LogOut className="size-[18px]" aria-hidden /><span className="sr-only">Sign out</span>
          </button>
        </form>
        <span className="mt-1" title={`${user.full_name} · ${ROLE_LABEL[user.role]}`}><Avatar person={user} size="md" /></span>
      </div>
    </div>
  );

  // Second panel: search, the project list with open-task counts, and a create button.
  const panel = (mobile: boolean) => (
    <div className="flex h-full flex-col gap-3 bg-shell px-3 pb-3 pt-4">
      <div className={cn('flex items-center justify-between px-1', mobile && 'pr-9')}>
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink-strong">{user.role === 'sales' ? 'Deals' : 'Projects'}</p>
        <span className="truncate pl-2 text-[11.5px] text-ink-foreground">{orgName}</span>
      </div>
      <button onClick={() => setPalette(true)} className="flex h-9 items-center gap-2 rounded-[10px] border bg-card px-2.5 text-[13px] text-ink-foreground hover:border-border-strong">
        <Search className="size-4" aria-hidden /> <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-[5px] border bg-muted px-1.5 font-sans text-[10.5px] font-medium">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      {mobile && (
        <nav aria-label="Main" className="flex flex-col gap-px">
          {nav.map(({ href, label, icon: Icon, badge }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}
              className={cn('flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong', isActive(href) && 'bg-foreground/[0.08] text-ink-strong')}>
              <Icon className="size-4" aria-hidden /> {label}
              {badge ? <span className="ml-auto rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold">{badge}</span> : null}
            </Link>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <button onClick={() => setProjectsOpen((o) => !o)} aria-expanded={projectsOpen} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[12.5px] text-ink-foreground hover:text-ink-strong">
          <Clock3 className="size-3.5" aria-hidden /> Active <ChevronDown className={cn('ml-auto size-3.5 transition-transform', !projectsOpen && '-rotate-90')} aria-hidden />
        </button>
        {projectsOpen && (
          <ul className="ml-3 mt-0.5 flex flex-col gap-px border-l pl-2">
            {projects.slice(0, 12).map((p) => {
              const here = pathname === `/projects/${p.id}`;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} aria-current={here ? 'page' : undefined}
                    className={cn('flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] text-ink-foreground transition-colors hover:bg-foreground/[0.06] hover:text-ink-strong', here && 'bg-foreground/[0.09] text-ink-strong')}>
                    <span className="text-ink-foreground/60">#</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.open ? <span className="grid min-w-5 place-items-center rounded-full px-1 text-[10.5px] font-semibold leading-5 text-black" style={{ background: p.color }}>{p.open}</span> : null}
                  </Link>
                </li>
              );
            })}
            {!projects.length && <li className="px-2 py-1 text-[12.5px] text-ink-foreground">No active projects.</li>}
          </ul>
        )}
        <Link href="/projects" className={cn('mt-1 flex h-8 items-center gap-2 rounded-[8px] px-1.5 text-[12.5px] text-ink-foreground hover:text-ink-strong', pathname === '/projects' && 'text-ink-strong')}>
          <FolderKanban className="size-3.5" aria-hidden /> {user.role === 'sales' ? 'All deals' : 'All projects'}
        </Link>
      </div>
      {timer && <RunningTimerPill timer={timer} />}
      {createHref && (
        <Link href={createHref} className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-card text-[13px] font-medium text-ink-strong hover:bg-muted">
          <Plus className="size-4" aria-hidden /> {createLabel}
        </Link>
      )}
      {mobile && (
        <div className="flex items-center gap-2 border-t pt-3">
          <Avatar person={user} size="sm" />
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-[13px] font-medium">{user.full_name}</p><p className="truncate text-[11px] text-ink-foreground">{ROLE_LABEL[user.role]}</p></div>
          <ThemeToggle className="size-8" />
          <form action={signOut}><button type="submit" className="grid size-8 place-items-center rounded-md text-ink-foreground hover:bg-foreground/[0.06]" title="Sign out"><LogOut className="size-4" aria-hidden /><span className="sr-only">Sign out</span></button></form>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-shell lg:grid lg:h-dvh lg:grid-cols-[60px_236px_1fr] lg:overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      <aside className="hidden h-dvh lg:block">{rail}</aside>
      <aside className="hidden h-dvh border-r lg:block" aria-label="Projects">{panel(false)}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50 animate-overlay-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r shadow-lift animate-drawer-in">
            {panel(true)}
            <button onClick={() => setOpen(false)} className="absolute right-3 top-[18px] grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/10" aria-label="Close menu"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col bg-background lg:overflow-y-auto" data-scroll-root>
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-xl sm:px-5 lg:hidden">
          <button onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label="Open menu" aria-expanded={open}>
            <Menu className="size-4" />
          </button>
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span aria-hidden className="grid size-5 place-items-center rounded-[5px] border border-border-strong bg-card text-[11px] font-semibold">S</span>{APP_NAME}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {timer && <RunningTimerPill timer={timer} compact />}
            <button onClick={() => setPalette(true)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Search"><Search className="size-4" /></button>
            <NotificationsBell initialUnread={unread} />
            {createHref && <Button asChild size="icon" variant="ghost"><Link href={createHref} aria-label={createLabel}><Plus /></Link></Button>}
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div key={pathname} className="mx-auto max-w-[1180px] animate-page-in">{children}</div>
        </main>
      </div>

      <Toaster />
      <Shortcuts onSearch={openSearch} helpOpen={help} setHelpOpen={setHelp} isMac={isMac} />
      <CommandPalette open={palette} onOpenChange={setPalette} projects={projects} canCreate={canCreate} />
    </div>
  );
}
