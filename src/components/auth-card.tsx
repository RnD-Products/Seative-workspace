import { APP_NAME } from '@/lib/utils';

/** Split layout: a quiet brand panel showing the product's idea (the work week), and the form. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const load = [2, 3, 1, 4, 2, 0, 0];
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-ink-foreground lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 text-white">
          <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-primary font-display font-bold">S</span>
          <span className="font-display text-lg font-semibold tracking-[-0.01em]">{APP_NAME}</span>
        </div>
        <div className="my-auto max-w-md">
          <p className="font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-white">Every deadline, one calm view.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-foreground/80">Plan projects, assign work and see progress across design, development and marketing.</p>
          <div className="mt-10 grid grid-cols-7 gap-1.5" aria-hidden>
            {days.map((d, i) => (
              <div key={d} className={`rounded-[10px] border border-white/10 p-2 ${i >= 5 ? 'opacity-40' : ''} ${i === 3 ? 'bg-primary/25 border-primary/50' : 'bg-white/[0.03]'}`}>
                <p className="text-[11px] text-ink-foreground/70">{d}</p>
                <div className="mt-2 space-y-1">
                  {Array.from({ length: load[i] }).map((_, j) => (
                    <div key={j} className="h-1.5 rounded-full" style={{ background: ['#5b6cff', '#f2a93b', '#17a673', '#e5577b'][(i + j) % 4], width: `${60 + ((i * 7 + j * 13) % 40)}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-foreground/50">Fridays and Saturdays are shaded as off days.</p>
      </aside>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-primary font-display font-bold text-white">S</span>
            <span className="font-display text-lg font-semibold">{APP_NAME}</span>
          </div>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
          {description && <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <AuthCard title="Connect Supabase to get started" description="The app needs a Supabase project before anyone can sign in.">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Create a project at supabase.com and run the SQL files in <code className="rounded bg-muted px-1">supabase/migrations</code>.</li>
        <li>Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code> and fill in your project URL and keys.</li>
        <li>Restart <code className="rounded bg-muted px-1">npm run dev</code>.</li>
      </ol>
    </AuthCard>
  );
}
