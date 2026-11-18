import * as React from 'react';

export function PageHeader({ title, description, actions, back }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {back}
        <h1 className="text-[22px] font-medium leading-tight tracking-[-0.03em] sm:text-[24px]">{title}</h1>
        {description && <p className="max-w-[65ch] text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      <span aria-hidden>‹</span> {children}
    </a>
  );
}
