'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

/* "C" opens whichever New-task dialog the current page offers (the most recently mounted one). */
const newTaskOpeners: (() => void)[] = [];
export function registerNewTask(open: () => void) {
  newTaskOpeners.push(open);
  return () => { const i = newTaskOpeners.lastIndexOf(open); if (i >= 0) newTaskOpeners.splice(i, 1); };
}

const GO: Record<string, { href: string; label: string }> = {
  o: { href: '/', label: 'Overview' },
  m: { href: '/my-work', label: 'My Work' },
  p: { href: '/projects', label: 'Projects' },
  t: { href: '/tasks', label: 'All tasks' },
  e: { href: '/team', label: 'Team' },
  s: { href: '/settings', label: 'Settings' },
  a: { href: '/ask', label: 'Ask about work' },
};

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-grid min-w-5 place-items-center rounded-[4px] border border-border-strong bg-muted px-1 font-sans text-[11px] font-medium text-foreground/80">{children}</kbd>;
}

export function Shortcuts({ onSearch, helpOpen, setHelpOpen, isMac }: { onSearch: () => void; helpOpen: boolean; setHelpOpen: (o: boolean) => void; isMac: boolean }) {
  const router = useRouter();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (pendingG.current) {
        window.clearTimeout(pendingG.current); pendingG.current = null;
        const dest = GO[k];
        if (dest) { e.preventDefault(); router.push(dest.href); }
        return;
      }
      if (k === 'g') { pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 1200); return; }
      if (k === '/') { e.preventDefault(); onSearch(); return; }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); return; }
      if (k === 'c') {
        e.preventDefault();
        const open = newTaskOpeners[newTaskOpeners.length - 1];
        if (open) open(); else toast('Open a project or My Work to add a task', { tone: 'info' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, onSearch, setHelpOpen]);

  const mod = isMac ? '⌘' : 'Ctrl';
  const groups: { title: string; rows: [React.ReactNode, string][] }[] = [
    { title: 'General', rows: [
      [<><Kbd>{mod}</Kbd><Kbd>K</Kbd></>, 'Search or jump to anything'],
      [<Kbd key="s">/</Kbd>, 'Search'],
      [<Kbd key="c">C</Kbd>, 'New task'],
      [<Kbd key="q">?</Kbd>, 'Show this list'],
    ] },
    { title: 'Go to', rows: Object.entries(GO).map(([key, d]) => [<><Kbd>G</Kbd><span className="text-muted-foreground">then</span><Kbd>{key.toUpperCase()}</Kbd></>, d.label] as [React.ReactNode, string]) },
    { title: 'While editing', rows: [
      [<Kbd key="e">Enter</Kbd>, 'Save a quick-add task or a renamed title'],
      [<><Kbd>{mod}</Kbd><Kbd>Enter</Kbd></>, 'Post a comment'],
      [<Kbd key="x">Esc</Kbd>, 'Cancel or close'],
    ] },
  ];

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without the mouse. Shortcuts pause while you are typing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-[11.5px] font-medium text-muted-foreground">{g.title}</h3>
              <ul className="divide-y rounded-lg border">
                {g.rows.map(([keys, label], i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span>{label}</span><span className="flex shrink-0 items-center gap-1 text-[11px]">{keys}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
