import * as React from 'react';

export function PageHeader({ title, description, actions, back }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {back}
        <h1 className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[32px]">{title}</h1>
        {description && <p className="max-w-[65ch] text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <span aria-hidden>‹</span> {children}
    </a>
  );
}
