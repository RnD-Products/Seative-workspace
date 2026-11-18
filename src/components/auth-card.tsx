import { APP_NAME } from '@/lib/utils';

/** Centred, quiet sign-in: the mark, one line of purpose, the form. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="grid-bg relative grid min-h-dvh place-items-center overflow-hidden bg-shell px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--shell)_75%)]" />
      <div aria-hidden className="pointer-events-none absolute left-[22%] top-[14%] h-[360px] w-[360px] rounded-full bg-[#6f8fff]/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute right-[22%] top-[14%] h-[360px] w-[360px] rounded-full bg-[#ba5539]/20 blur-[120px]" />
      <div className="relative w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span aria-hidden className="grid size-10 place-items-center rounded-[10px] border border-border-strong bg-card text-[17px] font-semibold text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">S</span>
          <p className="mt-3 text-[13px] text-muted-foreground">{APP_NAME}</p>
          <h1 className="mt-4 text-[26px] font-medium leading-tight tracking-[-0.03em]">{title}</h1>
          {description && <p className="mt-1.5 text-[13.5px] text-muted-foreground">{description}</p>}
        </div>
        <div className="relative rounded-xl border bg-card/90 p-5 shadow-lift backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-6 before:-top-px before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#a9bcff]/60 before:to-transparent">{children}</div>
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
