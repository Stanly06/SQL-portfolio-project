import { CalendarDays, Info, TrendingUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney, formatPct } from "@/lib/format";
import type { IncomeStatement } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Resumen financiero del período siguiendo el estado de resultados.
 * Las compras se muestran como dato informativo: NO se restan de la ganancia
 * (lo que se resta es el costo de la mercancía que efectivamente se vendió).
 */
export function FinancialSummary({ income, periodLabel }: { income: IncomeStatement; periodLabel: string }) {
  const rows: { label: string; value: number; sign?: "-" | "="; strong?: boolean }[] = [
    { label: "Ventas brutas", value: income.grossSales },
    { label: "Descuentos y devoluciones", value: income.discounts + income.returns, sign: "-" },
    { label: "Ingresos netos", value: income.netRevenue, sign: "=", strong: true },
    { label: "Costo de mercancía vendida", value: income.costOfGoodsSold, sign: "-" },
    { label: "Ganancia bruta", value: income.grossProfit, sign: "=", strong: true },
    { label: "Gastos operativos", value: income.operatingExpenses, sign: "-" },
    { label: "Gastos financieros", value: income.financialExpenses, sign: "-" },
  ];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<CalendarDays className="h-5 w-5" />}
        title="Resumen financiero"
      />
      <p className="px-5 pt-1 text-xs text-muted">{periodLabel}</p>
      <dl className="flex-1 space-y-0.5 px-5 pt-3 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn("flex items-center justify-between gap-3 py-1.5", r.strong && "border-t border-dashed border-line font-semibold text-plum")}
          >
            <dt className={cn("flex items-center gap-2", !r.strong && "text-muted")}>
              <span className="w-3 text-center text-xs text-muted">{r.sign ?? ""}</span>
              {r.label}
            </dt>
            <dd className="tabular font-medium text-ink">{formatMoney(r.value)}</dd>
          </div>
        ))}
      </dl>
      <div className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-4 py-3">
        <span className="flex items-center gap-2 font-[family-name:var(--font-display)] font-semibold text-plum">
          <TrendingUp className="h-5 w-5 text-success" /> Ganancia neta
        </span>
        <span className="text-right">
          <span className="tabular block text-lg font-bold text-success">{formatMoney(income.netProfit)}</span>
          <span className="block text-[11px] text-muted">Margen {formatPct(income.netMarginPct, false)}</span>
        </span>
      </div>
      <p className="flex gap-2 px-5 pb-4 pt-3 text-[11.5px] leading-snug text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Compras de mercancía del período: <b className="text-ink">{formatMoney(income.inventoryPurchases)}</b> (pasan al
          inventario, no se restan como gasto). ITBIS cobrado <b className="text-ink">{formatMoney(income.salesTax)}</b>{" "}
          excluido de los ingresos. Impuesto sobre la renta: se estima al cierre fiscal.
        </span>
      </p>
    </Card>
  );
}
