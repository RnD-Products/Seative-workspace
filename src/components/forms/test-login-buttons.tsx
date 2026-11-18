'use client';

import { useFormStatus } from 'react-dom';
import { BadgeDollarSign, Briefcase, Crown, UserRound } from 'lucide-react';
import { Spinner } from '@/components/ui/misc';
import { testSignIn } from '@/app/actions/test-login';
import type { TestAccount } from '@/lib/test-login';
import { cn } from '@/lib/utils';

const ICON = { ceo: Crown, pm: Briefcase, employee: UserRound, sales: BadgeDollarSign } as const;

function RoleButton({ account }: { account: TestAccount }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get('role') === account.role;
  const Icon = ICON[account.role];
  return (
    <button type="submit" name="role" value={account.role} disabled={pending}
      className={cn('group flex w-full items-center gap-3 rounded-lg border border-border-strong bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.06] disabled:opacity-60')}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-ai">{mine ? <Spinner /> : <Icon className="size-4" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">Sign in as {account.label}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{account.blurb}</span>
      </span>
      <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
    </button>
  );
}

export function TestLoginButtons({ accounts }: { accounts: TestAccount[] }) {
  return (
    <form action={testSignIn} className="space-y-2">
      {accounts.map((a) => <RoleButton key={a.role} account={a} />)}
    </form>
  );
}
