import { APP_NAME } from '@/lib/utils';

/** Centred, quiet sign-in: the mark, one line of purpose, the form. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-shell px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[120px]" />
      <div className="relative w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span aria-hidden className="glow-primary grid size-10 place-items-center rounded-[10px] text-[17px] font-bold text-white">S</span>
          <p className="mt-3 text-[13px] text-muted-foreground">{APP_NAME}</p>
          <h1 className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          {description && <p className="mt-1.5 text-[13.5px] text-muted-foreground">{description}</p>}
        </div>
        <div className="sheen rounded-xl border bg-background/80 p-5 shadow-lift backdrop-blur-xl">{children}</div>
        <p className="mt-6 text-center text-[12px] text-muted-foreground">Projects, tasks and progress for the whole team.</p>
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <AuthCard title="Connect Supabase to get started" description="The app needs a Supabase project before anyone can sign in.">
      <ol className="list-decimal space-y-2 pl-5 text-[13px] text-muted-foreground">
        <li>Create a project at supabase.com and run the SQL files in <code className="rounded bg-muted px-1">supabase/migrations</code>.</li>
        <li>Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code> and fill in your project URL and keys.</li>
        <li>Restart <code className="rounded bg-muted px-1">npm run dev</code>.</li>
      </ol>
    </AuthCard>
  );
}
