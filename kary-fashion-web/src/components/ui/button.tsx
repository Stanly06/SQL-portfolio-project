import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "soft" | "ghost" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-pink text-white hover:bg-pink-strong shadow-sm shadow-pink/30",
  soft: "bg-blush-soft text-plum hover:bg-blush",
  ghost: "text-plum hover:bg-canvas",
  outline: "border border-line bg-white text-plum hover:border-pink/40 hover:bg-blush-soft",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/50 disabled:opacity-50";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
