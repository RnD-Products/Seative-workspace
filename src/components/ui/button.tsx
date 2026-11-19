import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'glow-primary bg-primary font-semibold text-primary-foreground',
        outline: 'border border-border-strong bg-foreground/[0.03] text-foreground backdrop-blur hover:bg-foreground/[0.07]',
        secondary: 'bg-muted text-foreground hover:bg-foreground/[0.08]',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        ai: 'border border-ai/30 bg-ai-soft text-ai hover:bg-ai/20',
        link: 'h-auto px-0 text-ai underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-7 px-2.5 text-[12.5px]',
        lg: 'h-10 px-4 text-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
export { buttonVariants };
