'use client';
import { useSyncExternalStore } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; tone: Tone; action?: { label: string; run: () => void } };

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Show a short confirmation. Errors stay longer; an optional action (e.g. Undo) runs once. */
export function toast(message: string, opts: { tone?: Tone; action?: Toast['action']; duration?: number } = {}) {
  const t: Toast = { id: nextId++, message, tone: opts.tone ?? 'success', action: opts.action };
  items = [...items.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), opts.duration ?? (t.tone === 'error' ? 7000 : t.action ? 6000 : 3500));
}
toast.error = (message: string) => toast(message, { tone: 'error' });

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => items;
const empty: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end">
      {list.map((t) => {
        const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'info' ? Info : CheckCircle2;
        return (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className="sheen pointer-events-auto flex w-full max-w-sm animate-pop-in items-center gap-2.5 rounded-lg border border-border-strong bg-popover text-popover-foreground py-2.5 pl-3 pr-2 text-[13px] shadow-lift">
            <Icon className={cn('size-4 shrink-0', t.tone === 'error' ? 'text-destructive' : t.tone === 'info' ? 'text-info' : 'text-success')} aria-hidden />
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button className="rounded-md px-2 py-1 text-[12.5px] font-medium text-ai hover:bg-primary-soft"
                onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
            <button onClick={() => dismiss(t.id)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
