import "server-only";
import { todayRD } from "./dashboard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const RANGE_PRESETS = [
  { key: "hoy", label: "Hoy" }, { key: "semana", label: "Esta semana" }, { key: "mes", label: "Este mes" },
  { key: "mes-anterior", label: "Mes anterior" }, { key: "anio", label: "Este año" },
] as const;

export interface DateRange {
  from: string; to: string; label: string; preset: string;
  prevFrom: string; prevTo: string; prevLabel: string;
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(d(s).getTime() + n * 86_400_000));
const days = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86_400_000) + 1;

/** Lee ?periodo=… o ?desde=…&hasta=… y calcula el período anterior equivalente. */
export function parseRange(sp: Record<string, string | string[] | undefined>, fallback = "mes"): DateRange {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const today = todayRD();
  const t = d(today), y = t.getUTCFullYear(), m = t.getUTCMonth();
  const desde = one("desde"), hasta = one("hasta");
  if (desde && hasta && ISO.test(desde) && ISO.test(hasta)) {
    const [from, to] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    const n = days(from, to);
    return { from, to, preset: "rango", label: `${fmt(from)} al ${fmt(to)}`,
      prevFrom: addDays(from, -n), prevTo: addDays(from, -1), prevLabel: `los ${n} días anteriores` };
  }
  const preset = one("periodo") ?? fallback;
  if (preset === "hoy") return { from: today, to: today, preset, label: "Hoy", prevFrom: addDays(today, -1), prevTo: addDays(today, -1), prevLabel: "ayer" };
  if (preset === "semana") {
    const from = addDays(today, -((t.getUTCDay() + 6) % 7));
    return { from, to: today, preset, label: "Esta semana", prevFrom: addDays(from, -7), prevTo: addDays(today, -7), prevLabel: "la semana anterior" };
  }
  if (preset === "mes-anterior") {
    const from = iso(new Date(Date.UTC(y, m - 1, 1))), to = iso(new Date(Date.UTC(y, m, 0)));
    return { from, to, preset, label: `${cap(MESES[(m + 11) % 12])} ${m === 0 ? y - 1 : y}`,
      prevFrom: iso(new Date(Date.UTC(y, m - 2, 1))), prevTo: iso(new Date(Date.UTC(y, m - 1, 0))), prevLabel: "el mes anterior" };
  }
  if (preset === "anio") {
    return { from: `${y}-01-01`, to: today, preset, label: `Año ${y}`, prevFrom: `${y - 1}-01-01`,
      prevTo: iso(new Date(Date.UTC(y - 1, m, t.getUTCDate()))), prevLabel: `el mismo período de ${y - 1}` };
  }
  const from = iso(new Date(Date.UTC(y, m, 1)));
  const prevLast = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: today, preset: "mes", label: `${cap(MESES[m])} ${y}`, prevFrom: iso(new Date(Date.UTC(y, m - 1, 1))),
    prevTo: iso(new Date(Date.UTC(y, m - 1, Math.min(t.getUTCDate(), prevLast)))), prevLabel: "el mes anterior (mismos días)" };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fmt(s: string) { const [yy, mm, dd] = s.split("-"); return `${dd}/${mm}/${yy}`; }

export function rangeQuery(r: DateRange): string {
  return r.preset === "rango" ? `desde=${r.from}&hasta=${r.to}` : `periodo=${r.preset}`;
}
