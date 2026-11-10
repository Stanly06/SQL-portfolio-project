import type { IncomeStatement, IncomeStatementInput } from "./types";

/**
 * Estado de resultados simplificado de Kary Fashion.
 *
 *   Ingresos netos     = Ventas brutas − Descuentos − Devoluciones   (sin ITBIS)
 *   Ganancia bruta     = Ingresos netos − Costo de la mercancía vendida
 *   Ganancia operativa = Ganancia bruta − Gastos operativos
 *   Ganancia neta      = Ganancia operativa − Gastos financieros − Impuesto sobre la renta
 *
 * Las COMPRAS de inventario no se restan: se convierten en costo solo cuando la
 * mercancía se vende (CMV). El ITBIS cobrado tampoco es ingreso de la tienda.
 */
export function buildIncomeStatement(input: IncomeStatementInput): IncomeStatement {
  const netRevenue = input.grossSales - input.discounts - input.returns;
  const grossProfit = netRevenue - input.costOfGoodsSold;
  const operatingProfit = grossProfit - input.operatingExpenses;
  const netProfit = operatingProfit - input.financialExpenses - input.incomeTax;
  return {
    ...input,
    netRevenue,
    grossProfit,
    operatingProfit,
    netProfit,
    grossMarginPct: marginPct(grossProfit, netRevenue),
    operatingMarginPct: marginPct(operatingProfit, netRevenue),
    netMarginPct: marginPct(netProfit, netRevenue),
  };
}

export function marginPct(part: number, revenue: number): number {
  if (!revenue) return 0;
  return Math.round((part / revenue) * 1000) / 10;
}

/** Variación porcentual; null cuando el período anterior es 0 (no se puede comparar). */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Extrae el ITBIS incluido en un precio final. 18% por defecto (RD). */
export function splitTax(totalWithTax: number, ratePct = 18): { base: number; tax: number } {
  const base = Math.round((totalWithTax * 100) / (100 + ratePct));
  return { base, tax: totalWithTax - base };
}
