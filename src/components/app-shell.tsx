'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react';
import { cn, APP_NAME } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/domain';
import type { Role } from '@/lib/types';
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

export function AppShell({ user, orgName, projects, canCreate, children }: {
  user: { id: string; full_name: string; role: Role }; orgName: string; projects: PaletteProject[]; canCreate: boolean; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [isMac, setIsMac] = useState(true);

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

  const sidebar = (
    <div className="flex h-full flex-col gap-6 bg-ink px-3 py-4 text-ink-foreground">
      <Link href="/" className="flex items-center gap-2.5 px-2 text-white">
        <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-primary font-display text-[15px] font-bold text-white">S</span>
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-semibold tracking-[-0.01em]">{APP_NAME}</span>
          <span className="block text-xs text-ink-foreground/70">{orgName}</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-sm font-medium transition-colors hover:bg-white/[0.06] hover:text-white',
              isActive(href) && 'bg-white/[0.09] text-white',
            )}
          >
            <Icon className={cn('size-4 text-ink-foreground/60 group-hover:text-white', isActive(href) && 'text-primary')} aria-hidden /> {label}
          </Link>
        ))}
      </nav>

      {projects.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-foreground/50">Active projects</p>
          <ul className="flex flex-col gap-0.5">
            {projects.slice(0, 8).map((p) => {
              const here = pathname === `/projects/${p.id}`;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} aria-current={here ? 'page' : undefined}
                    className={cn('flex items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-[13px] transition-colors hover:bg-white/[0.06] hover:text-white', here && 'bg-white/[0.09] text-white')}>
                    <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!projects.length && <div className="flex-1" />}

      <Link href="/ask" aria-current={pathname === '/ask' ? 'page' : undefined}
        className={cn('flex items-center gap-3 rounded-[12px] border border-white/10 px-3 py-2.5 text-sm text-white transition-colors hover:bg-white/[0.06]', pathname === '/ask' && 'bg-white/[0.09]')}>
        <Sparkles className="size-4 text-[#c3a6ff]" aria-hidden />
        <span className="flex-1">Ask about work</span>
      </Link>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-1 pt-4">
        <Avatar person={user} size="md" className="ring-2 ring-white/10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
          <p className="truncate text-xs text-ink-foreground/70">{ROLE_LABEL[user.role]}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="grid size-8 place-items-center rounded-[8px] text-ink-foreground/70 hover:bg-white/[0.08] hover:text-white" title="Sign out">
            <LogOut className="size-4" aria-hidden /><span className="sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-lift">
            {sidebar}
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 grid size-8 place-items-center rounded-[8px] text-white hover:bg-white/10" aria-label="Close menu"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-[10px] hover:bg-muted lg:hidden" aria-label="Open menu" aria-expanded={open}>
            <Menu className="size-5" />
          </button>
          <button onClick={() => setPalette(true)}
            className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-[10px] border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-input">
            <Search className="size-4" aria-hidden />
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <kbd className="hidden rounded-[6px] border bg-muted px-1.5 py-0.5 font-sans text-[11px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {canCreate && (
              <Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/projects/new"><Plus /> New project</Link></Button>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} projects={projects} canCreate={canCreate} />
    </div>
  );
}
