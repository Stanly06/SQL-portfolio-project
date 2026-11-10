const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyExact = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("es-DO");

/** 2854000 centavos -> "RD$28,540" */
export function formatMoney(cents: number, exact = false): string {
  const txt = (exact ? moneyExact : money).format(cents / 100);
  return txt.replace("$", "RD$").replace("RD$RD$", "RD$");
}

/** Formato compacto para ejes de gráficos: 2854000000 -> "RD$28.5M" */
export function formatMoneyCompact(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `RD$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `RD$${(v / 1_000).toFixed(0)}K`;
  return `RD$${v.toFixed(0)}`;
}

export function formatNumber(n: number): string {
  return integer.format(n);
}

export function formatPct(n: number | null, withSign = true): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const s = n.toFixed(1);
  return withSign && n > 0 ? `+${s}%` : `${s}%`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-10" -> "10 nov 2026" (sin depender de la zona horaria del navegador) */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}
