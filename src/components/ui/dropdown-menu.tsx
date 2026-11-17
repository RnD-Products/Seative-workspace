'use client';
import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn('z-50 min-w-44 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-lg border border-border-strong bg-raised p-1 shadow-lift data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out', className)} {...props} />
    </Menu.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item>) {
  return <Menu.Item className={cn('flex cursor-default select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-muted [&_svg]:size-4', className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />;
}
export const DropdownMenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />;
