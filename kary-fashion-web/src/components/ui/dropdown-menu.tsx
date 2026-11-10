"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-52 overflow-hidden rounded-2xl border border-line bg-white p-1.5 text-sm text-ink",
          "shadow-[var(--shadow-pop)] animate-fade-up",
          className,
        )}
        {...props}
      />
    </Dropdown.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2 outline-none",
        "data-[highlighted]:bg-blush-soft data-[highlighted]:text-plum",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Dropdown.Label>) {
  return <Dropdown.Label className={cn("px-3 pb-1 pt-2 text-xs font-medium text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Dropdown.Separator>) {
  return <Dropdown.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}

export const DropdownMenuRadioGroup = Dropdown.RadioGroup;

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Dropdown.RadioItem>) {
  return (
    <Dropdown.RadioItem
      className={cn(
        "flex cursor-pointer select-none items-center justify-between gap-2.5 rounded-xl px-3 py-2 outline-none",
        "data-[highlighted]:bg-blush-soft data-[state=checked]:font-semibold data-[state=checked]:text-pink-strong",
        className,
      )}
      {...props}
    >
      {children}
      <Dropdown.ItemIndicator>●</Dropdown.ItemIndicator>
    </Dropdown.RadioItem>
  );
}
