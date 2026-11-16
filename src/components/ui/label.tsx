'use client';
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />
));
Label.displayName = 'Label';

/** Label + control + hint/error, wired up with aria attributes. */
export function FormField({
  id, label, error, hint, children, className,
}: { id: string; label: string; error?: string; hint?: string; children: React.ReactElement<Record<string, unknown>>; className?: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
