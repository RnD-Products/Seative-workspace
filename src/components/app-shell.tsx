'use client';
import { Toaster } from './ui/toast';
import { Shortcuts } from './shortcuts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { FolderKanban, Keyboard, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react';
import { cn, APP_NAME } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/domain';
import type { Role, RunningTimer } from '@/lib/types';
import { RunningTimerPill } from './time/running-timer';
import { Avatar } from './badges';
import { ThemeToggle } from './theme-toggle';
import { CommandPalette, type PaletteProject } from './command-palette';
import { Button } from './ui/button';
import { signOut } from '@/app/actions/auth';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/my-work', label: 'My Work', icon: ListChecks },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ user, orgName, projects, canCreate, timer, children }: {
  user: { id: string; full_name: string; role: Role }; orgName: string; projects: PaletteProject[]; canCreate: boolean; timer: RunningTimer | null; children: React.ReactNode;
}) {
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

  const navItem = (active: boolean) => cn(
    'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-ink-foreground transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-ink-strong active:bg-foreground/[0.08]',
    active && 'bg-foreground/[0.07] text-ink-strong shadow-[inset_0_1px_0_var(--edge),0_0_0_1px_var(--border)]',
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-5 bg-shell px-2.5 pb-3 pt-3">
      <div className="flex items-center gap-1">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-foreground/[0.05]">
          <span aria-hidden className="glow-primary grid size-[22px] shrink-0 place-items-center rounded-[6px] text-[12px] font-bold text-white">S</span>
          <span className="truncate text-[13px] font-semibold text-ink-strong">{orgName}</span>
        </Link>
        <button onClick={() => setPalette(true)} className="grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong" title={`Search (${isMac ? '⌘' : 'Ctrl'} K)`}>
          <Search className="size-4" aria-hidden /><span className="sr-only">Search</span>
        </button>
        {canCreate && (
          <Link href="/projects/new" className="grid size-7 place-items-center rounded-md border border-border-strong bg-card text-ink-strong hover:bg-muted" title="New project">
            <Plus className="size-4" aria-hidden /><span className="sr-only">New project</span>
          </Link>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-col gap-px">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={navItem(isActive(href))}>
            <Icon className={cn('size-4 opacity-70 group-hover:opacity-100', isActive(href) && 'text-primary opacity-100 drop-shadow-[0_0_6px_var(--primary)]')} aria-hidden /> {label}
          </Link>
        ))}
        <Link href="/ask" aria-current={pathname === '/ask' ? 'page' : undefined} className={navItem(pathname === '/ask')}>
          <Sparkles className="size-4 text-ai" aria-hidden /> Ask about work
        </Link>
      </nav>

      {projects.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="px-2 pb-1 text-[11px] font-medium text-ink-foreground/80">Projects</p>
          <ul className="flex flex-col gap-px">
            {projects.slice(0, 10).map((p) => {
              const here = pathname === `/projects/${p.id}`;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} aria-current={here ? 'page' : undefined} className={cn(navItem(here), 'font-normal')}>
                    <span aria-hidden className="grid size-4 shrink-0 place-items-center"><span className="size-2 rounded-[2px]" style={{ background: p.color }} /></span>
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : <div className="flex-1" />}

      {timer && <RunningTimerPill timer={timer} />}

      <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
        <Avatar person={user} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium text-ink-strong">{user.full_name}</p>
          <p className="truncate text-[11px] text-ink-foreground">{ROLE_LABEL[user.role]}</p>
        </div>
        <button onClick={() => setHelp(true)} className="hidden size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong lg:grid" title="Keyboard shortcuts (?)">
          <Keyboard className="size-4" aria-hidden /><span className="sr-only">Keyboard shortcuts</span>
        </button>
        <ThemeToggle className="size-7" />
        <form action={signOut}>
          <button type="submit" className="grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/[0.06] hover:text-ink-strong" title="Sign out">
            <LogOut className="size-4" aria-hidden /><span className="sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-shell lg:grid lg:h-dvh lg:grid-cols-[232px_1fr] lg:overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      <aside className="hidden h-dvh lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50 animate-overlay-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r shadow-lift animate-drawer-in">
            {sidebar}
            <button onClick={() => setOpen(false)} className="absolute right-2 top-12 grid size-7 place-items-center rounded-md text-ink-foreground hover:bg-foreground/10" aria-label="Close menu"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div className="ambient flex min-w-0 flex-col lg:my-2 lg:mr-2 lg:overflow-y-auto lg:rounded-xl lg:border lg:shadow-[0_0_0_1px_var(--edge),0_20px_60px_-30px_rgb(0_0_0/0.6)]" data-scroll-root>
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-xl sm:px-5 lg:hidden">
          <button onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label="Open menu" aria-expanded={open}>
            <Menu className="size-4" />
          </button>
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span aria-hidden className="grid size-5 place-items-center rounded-[5px] bg-primary text-[11px] font-bold text-white">S</span>{APP_NAME}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {timer && <RunningTimerPill timer={timer} compact />}
            <button onClick={() => setPalette(true)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Search"><Search className="size-4" /></button>
            {canCreate && <Button asChild size="icon" variant="ghost"><Link href="/projects/new" aria-label="New project"><Plus /></Link></Button>}
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
