import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      gray: 'bg-muted text-muted-foreground',
      blue: 'bg-info-soft text-info',
      green: 'bg-success-soft text-success',
      amber: 'bg-warning-soft text-warning',
      red: 'bg-destructive-soft text-destructive',
      purple: 'bg-primary-soft text-primary',
      ai: 'bg-ai-soft text-ai',
      deadline: 'bg-deadline-soft text-deadline',
    },
  },
  defaultVariants: { tone: 'gray' },
});

export function Badge({ className, tone, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {props.children}
    </span>
  );
}
