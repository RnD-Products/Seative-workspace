'use client';
import { Toaster } from './ui/toast';
import { Shortcuts } from './shortcuts';
import { NotificationsBell } from './notifications-bell';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ChevronDown, Clock3, FolderKanban, Inbox, MessagesSquare, OctagonAlert, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react';
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

  // Second panel: search, the project list with open-task counts, and a create button.
  const panel = (mobile: boolean) => (
    <div className={cn('flex h-full flex-col gap-3 px-3 pb-3 pt-4', mobile && 'bg-shell')}>
      <div className={cn('flex items-center justify-between px-1', mobile && 'pr-9')}>
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink-strong">{user.role === 'sales' ? 'Deals' : 'Projects'}</p>
        <span className="truncate pl-2 text-[11.5px] text-ink-foreground">{orgName}</span>
      </div>
      <button onClick={() => setPalette(true)} className="flex h-9 items-center gap-2 rounded-full border bg-foreground/[0.03] px-3 text-[13px] text-ink-foreground hover:border-border-strong lg:hidden">
        <Search className="size-4" aria-hidden /> <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-[5px] border bg-muted px-1.5 font-sans text-[10.5px] font-medium">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      {mobile && (
        <nav aria-label="Main" className="flex flex-col gap-px">
          {nav.map(({ href, label, icon: Icon, badge }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}
              className={cn('flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong', isActive(href) && 'bg-foreground/[0.08] text-ink-strong')}>
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
                    className={cn('flex h-9 items-center gap-2 rounded-full px-3 text-[13px] text-ink-foreground transition-colors hover:bg-foreground/[0.06] hover:text-ink-strong', here && 'bg-foreground/[0.09] text-ink-strong')}>
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
        <Link href={createHref} className="flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">
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


  // Floating top bar: brand, pill navigation, and tools on the right.
  const topbar = (
    <header className="glass sticky top-3 z-30 mx-3 mt-3 hidden h-14 shrink-0 items-center gap-3 rounded-full border px-2.5 lg:flex">
      <Link href="/" className="flex items-center gap-2 pl-1 pr-2" title={orgName}>
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-foreground text-[14px] font-bold text-background">S</span>
        <span className="hidden whitespace-nowrap text-[14px] font-medium tracking-[-0.01em] text-ink-strong 2xl:inline">{APP_NAME}</span>
      </Link>
      <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border bg-foreground/[0.03] p-1 [scrollbar-width:none]">
        {nav.map(({ href, label, badge, tone }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}
            className={cn('relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] text-ink-foreground transition-colors hover:text-ink-strong',
              isActive(href) && 'bg-raised text-ink-strong shadow-[inset_0_1px_0_var(--edge),0_1px_2px_rgb(0_0_0/0.2)]')}>
            {label}
            {badge ? <span className={cn('grid min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold leading-[18px]', tone === 'red' ? 'bg-destructive-soft text-destructive' : tone === 'primary' ? 'bg-primary-soft text-ink-strong' : 'bg-deadline-soft text-deadline')}>{badge}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {timer && <RunningTimerPill timer={timer} compact />}
        <button onClick={() => setPalette(true)} className="flex h-9 w-9 items-center justify-center gap-2 rounded-full border bg-foreground/[0.03] text-[13px] text-ink-foreground hover:border-border-strong 2xl:w-56 2xl:justify-start 2xl:px-3" aria-label="Search">
          <Search className="size-4" aria-hidden /><span className="hidden flex-1 text-left 2xl:inline">Search</span>
          <kbd className="hidden rounded-full bg-foreground/[0.06] px-2 font-sans text-[10.5px] 2xl:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        {user.role !== 'sales' && (
          <Link href="/ask" className="grid size-9 place-items-center rounded-full border bg-foreground/[0.03] text-ai hover:border-border-strong" title="Ask about work"><Sparkles className="size-4" aria-hidden /><span className="sr-only">Ask about work</span></Link>
        )}
        <span className="grid size-9 place-items-center rounded-full border bg-foreground/[0.03]"><NotificationsBell initialUnread={unread} /></span>
        <span className="grid size-9 place-items-center rounded-full border bg-foreground/[0.03]"><ThemeToggle className="size-8 rounded-full" /></span>
        <form action={signOut}>
          <button type="submit" className="grid size-9 place-items-center rounded-full border bg-foreground/[0.03] text-ink-foreground hover:text-ink-strong" title="Sign out"><LogOut className="size-4" aria-hidden /><span className="sr-only">Sign out</span></button>
        </form>
        <button onClick={() => setHelp(true)} className="pl-0.5" title={`${user.full_name} · ${ROLE_LABEL[user.role]} — keyboard shortcuts`}><Avatar person={user} size="lg" /></button>
      </div>
    </header>
  );

  return (
    <div className="ambient flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {topbar}

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50 animate-overlay-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r shadow-lift animate-drawer-in">
            {panel(true)}
            <button onClick={() => setOpen(false)} className="absolute right-3 top-[18px] grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/10" aria-label="Close menu"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 lg:p-3">
      <aside className="glass hidden w-[256px] shrink-0 overflow-hidden rounded-[24px] border lg:block" aria-label="Projects">{panel(false)}</aside>
      <div className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto lg:rounded-[24px]" data-scroll-root>
        <header className="glass sticky top-2 z-30 mx-2 mt-2 flex h-12 shrink-0 items-center gap-2 rounded-full border px-2 sm:px-3 lg:hidden">
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
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-5 lg:py-4">
          <div key={pathname} className="mx-auto max-w-[1180px] animate-page-in">{children}</div>
        </main>
      </div>
      </div>

      <Toaster />
      <Shortcuts onSearch={openSearch} helpOpen={help} setHelpOpen={setHelp} isMac={isMac} />
      <CommandPalette open={palette} onOpenChange={setPalette} projects={projects} canCreate={canCreate} />
    </div>
  );
}
