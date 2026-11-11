import { formatMoney, formatNumber } from "./format";

/** Formato de una celda de reporte para pantalla y CSV. */
export function formatCell(v: unknown, type: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return formatMoney(Number(v));
  if (type === "int") return formatNumber(Number(v));
  if (type === "pct") return `${Number(v).toFixed(1)}%`;
  if (type === "date") {
    const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T12:00:00Z` : String(v));
    return new Intl.DateTimeFormat("es-DO", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  return String(v);
}
