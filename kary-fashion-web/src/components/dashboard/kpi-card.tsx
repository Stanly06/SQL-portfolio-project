import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "pink" | "lavender" | "cream" | "mint";

const TONES: Record<Tone, { card: string; icon: string }> = {
  pink: { card: "from-blush-soft to-blush/70 border-blush", icon: "text-pink-strong bg-white/70" },
  lavender: { card: "from-[#f6f0fd] to-lavender-soft border-lavender-soft", icon: "text-lavender bg-white/70" },
  cream: { card: "from-cream to-gold-soft border-gold-soft", icon: "text-gold bg-white/70" },
  mint: { card: "from-[#f2fbf6] to-success-soft border-success-soft", icon: "text-success bg-white/70" },
};

export function KpiCard({
  tone,
  icon: Icon,
  label,
  value,
  changePct,
  comparisonLabel,
  footer,
  delay = 0,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  value: string;
  changePct?: number | null;
  comparisonLabel?: string;
  footer?: ReactNode;
  delay?: number;
}) {
  const t = TONES[tone];
  const up = (changePct ?? 0) >= 0;
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-card)] border bg-gradient-to-br p-5 shadow-[var(--shadow-card)]",
        "transition-transform duration-300 hover:-translate-y-0.5 animate-fade-up",
        t.card,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-4">
        <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", t.icon)}>
          <Icon className="h-8 w-8" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-plum/80">{label}</p>
          <p className="tabular mt-1 truncate font-[family-name:var(--font-sans)] text-[26px] font-bold leading-tight tracking-tight text-ink">
            {value}
          </p>
          {changePct !== undefined && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[13px]">
              {changePct === null ? (
                <span className="text-muted">Sin datos para comparar</span>
              ) : (
                <>
                  <span className={cn("inline-flex items-center gap-1 font-semibold", up ? "text-success" : "text-danger")}>
                    {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {formatPct(changePct)}
                  </span>
                  <span className="text-muted">{comparisonLabel}</span>
                </>
              )}
            </p>
          )}
          {footer && <div className="mt-2">{footer}</div>}
        </div>
      </div>
    </article>
  );
}
