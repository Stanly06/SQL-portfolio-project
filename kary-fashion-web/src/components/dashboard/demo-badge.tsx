import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Etiqueta obligatoria en cualquier cifra que no provenga de datos reales. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title="Cifras de ejemplo generadas para el prototipo. No son datos reales de la tienda."
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-dashed border-lavender/60 bg-white/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lavender",
        className,
      )}
    >
      <FlaskConical className="h-3.5 w-3.5" />
      Datos de demostración
    </span>
  );
}
