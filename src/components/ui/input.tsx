import * as React from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-[10px] border border-input bg-card text-sm text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, 'h-9 px-3', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, 'min-h-20 px-3 py-2 leading-relaxed', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

/** Native select: fully accessible, works without JavaScript, and is easy to use with forms. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        field,
        'select-chevron h-9 cursor-pointer appearance-none pl-3 pr-8',
        className,
      )}
      {...props}
    />
  ),
);
NativeSelect.displayName = 'NativeSelect';
