import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-pink">{icon}</span>}
        <h2 className="truncate text-[15px] font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}
