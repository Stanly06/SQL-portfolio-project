import Link from "next/link";
import { cn } from "@/lib/utils";

/** Filtro de período: accesos rápidos + rango personalizado (formulario GET, funciona sin JavaScript). */
export function RangeFilter({ basePath, preset, from, to, extra = {} }: {
  basePath: string; preset: string; from: string; to: string; extra?: Record<string, string>;
}) {
  const presets = [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Este mes"], ["mes-anterior", "Mes anterior"], ["anio", "Año"]];
  const qs = (p: Record<string, string>) => new URLSearchParams({ ...extra, ...p }).toString();
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <nav className="flex flex-wrap rounded-xl bg-white p-1 text-sm shadow-sm" aria-label="Período">
        {presets.map(([k, l]) => (
          <Link key={k} href={`${basePath}?${qs({ periodo: k })}`}
                className={cn("rounded-lg px-3 py-1.5", preset === k ? "bg-blush font-semibold text-pink-strong" : "text-muted hover:text-plum")}>{l}</Link>
        ))}
      </nav>
      <form action={basePath} className="flex flex-wrap items-end gap-2">
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-xs text-muted">Desde<input type="date" name="desde" defaultValue={from} className="input mt-1 py-1.5" /></label>
        <label className="text-xs text-muted">Hasta<input type="date" name="hasta" defaultValue={to} className="input mt-1 py-1.5" /></label>
        <button className={cn("rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-plum hover:bg-blush-soft", preset === "rango" && "border-pink/40")}>Ver</button>
      </form>
    </div>
  );
}
