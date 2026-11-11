import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title, description, actions, back,
}: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-pink-strong">
            <ChevronLeft className="h-3.5 w-3.5" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-5 py-3.5">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-cream/60 px-6 py-10 text-center">
      <p className="font-[family-name:var(--font-display)] font-semibold text-plum">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-5 -mt-5 overflow-x-auto">{children}</div>;
}

export function NeedsDatabase() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState title="Este módulo necesita la base de datos">
        <Database className="mx-auto mb-2 h-6 w-6 text-lavender" />
        Está viendo el modo demostración. Configure <code>DATABASE_URL</code> (ver <code>.env.example</code>) para usar
        productos, inventario, ventas y pedidos reales.
      </EmptyState>
    </div>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "success" | "danger" | "pink" }) {
  const color = { default: "text-ink", success: "text-success", danger: "text-danger", pink: "text-pink-strong" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular mt-0.5 text-lg font-bold", color)}>{value}</p>
    </div>
  );
}
