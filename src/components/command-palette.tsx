'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, FolderKanban, LayoutDashboard, ListChecks, Plus, Search, Settings, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaletteProject { id: string; name: string; color: string }

interface Item { id: string; label: string; hint?: string; group: string; icon: React.ReactNode; run: () => void }

/** ⌘K / Ctrl+K: jump to a page or project, run a common action, or search tasks. */
export function CommandPalette({ open, onOpenChange, projects, canCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; projects: PaletteProject[]; canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const go = (href: string) => { onOpenChange(false); router.push(href); };

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: 'overview', label: 'Overview', group: 'Go to', icon: <LayoutDashboard />, run: () => go('/') },
      { id: 'mywork', label: 'My Work', group: 'Go to', icon: <ListChecks />, run: () => go('/my-work') },
      { id: 'projects', label: 'Projects', group: 'Go to', icon: <FolderKanban />, run: () => go('/projects') },
      { id: 'tasks', label: 'All tasks', group: 'Go to', icon: <ListChecks />, run: () => go('/tasks') },
      { id: 'team', label: 'Team', group: 'Go to', icon: <Users />, run: () => go('/team') },
      { id: 'settings', label: 'Settings', group: 'Go to', icon: <Settings />, run: () => go('/settings') },
      ...(canCreate ? [{ id: 'new', label: 'New project', group: 'Actions', icon: <Plus />, run: () => go('/projects/new') }] : []),
      { id: 'ask', label: 'Ask about work', group: 'Actions', icon: <Sparkles />, run: () => go('/ask') },
      ...projects.map((p) => ({ id: `p-${p.id}`, label: p.name, group: 'Projects', icon: <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />, run: () => go(`/projects/${p.id}`) })),
    ];
    const q = query.trim().toLowerCase();
    const filtered = q ? base.filter((i) => i.label.toLowerCase().includes(q)) : base;
    if (q) filtered.push({ id: 'search', label: `Search tasks for “${query.trim()}”`, group: 'Search', icon: <Search />, run: () => go(`/tasks?q=${encodeURIComponent(query.trim())}`) });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, projects, canCreate]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const groups = [...new Set(items.map((i) => i.group))];
  let index = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-label="Search or jump to"
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[18px] border bg-card shadow-lift"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search or jump to</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a page or project, or search tasks…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            />
            <kbd className="rounded-[6px] border px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</kbd>
          </div>
          <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {groups.map((g) => (
              <li key={g} role="presentation">
                <p className="px-2.5 pb-1 pt-2.5 text-xs font-medium text-muted-foreground">{g}</p>
                <ul role="presentation">
                  {items.filter((i) => i.group === g).map((i) => {
                    index += 1;
                    const idx = index;
                    return (
                      <li
                        key={i.id}
                        id={`palette-${i.id}`}
                        role="option"
                        aria-selected={idx === active}
                        data-index={idx}
                        onMouseMove={() => setActive(idx)}
                        onClick={i.run}
                        className={cn('flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground', idx === active && 'bg-primary-soft text-primary [&_svg]:text-primary')}
                      >
                        <span className="grid size-5 place-items-center">{i.icon}</span>
                        <span className="flex-1 truncate">{i.label}</span>
                        {idx === active && <CornerDownLeft className="size-3.5" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches.</li>}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
