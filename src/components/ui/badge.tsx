import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[12px] font-medium whitespace-nowrap', {
  variants: {
    tone: {
      gray: 'border-border-strong text-muted-foreground [&>[data-dot]]:bg-muted-foreground',
      blue: 'border-border-strong text-foreground/85 [&>[data-dot]]:bg-info',
      green: 'border-border-strong text-foreground/85 [&>[data-dot]]:bg-success',
      amber: 'border-border-strong text-foreground/85 [&>[data-dot]]:bg-warning',
      red: 'border-destructive/30 bg-destructive-soft text-destructive [&>[data-dot]]:bg-destructive',
      purple: 'border-border-strong text-foreground/85 [&>[data-dot]]:bg-primary',
      ai: 'border-ai/25 bg-ai-soft text-ai',
      deadline: 'border-deadline/30 bg-deadline-soft text-deadline',
    },
  },
  defaultVariants: { tone: 'gray' },
});

export function Badge({ className, tone, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden data-dot className="size-[7px] rounded-full bg-current" />}
      {props.children}
    </span>
  );
}
