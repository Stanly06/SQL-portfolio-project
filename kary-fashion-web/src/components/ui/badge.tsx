import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "pink" | "lavender" | "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const TONES: Record<BadgeTone, string> = {
  pink: "bg-blush text-pink-strong",
  lavender: "bg-lavender-soft text-lavender",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-[#b86e10]",
  danger: "bg-danger-soft text-danger",
  info: "bg-[#e6effc] text-[#2f6fd1]",
  neutral: "bg-canvas text-muted",
  gold: "bg-gold-soft text-[#8f6a12]",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
