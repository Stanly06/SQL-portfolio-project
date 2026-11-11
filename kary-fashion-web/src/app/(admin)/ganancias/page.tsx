import { NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { RangeFilter } from "@/components/ui/range-filter";
import { buildIncomeStatement, changePct } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/format";
import { loadAs } from "@/lib/server/page";
import { parseRange } from "@/lib/server/range";
import type { Tx } from "@/lib/server/db";
import { MonthlyChart } from "./monthly-chart";

export const metadata = { title: "Ganancias" };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
type IS = { gross_sales_cents: number; discounts_cents: number; returns_cents: number; sales_tax_cents: number; cost_of_goods_sold_cents: number;
  operating_expenses_cents: number; financial_expenses_cents: number; income_tax_cents: number; inventory_purchases_cents: number; sales_count: number };

const toStatement = (r: IS) => buildIncomeStatement({ grossSales: r.gross_sales_cents, discounts: r.discounts_cents, returns: r.returns_cents,
  salesTax: r.sales_tax_cents, costOfGoodsSold: r.cost_of_goods_sold_cents, operatingExpenses: r.operating_expenses_cents,
  financialExpenses: r.financial_expenses_cents, incomeTax: r.income_tax_cents, inventoryPurchases: r.inventory_purchases_cents });
const statement = async (tx: Tx, from: string, to: string) =>
  (await tx<IS[]>`select * from public.income_statement(${from}::date, ${to}::date)`)[0];

export default async function ProfitPage(props: PageProps<"/ganancias">) {
  const r = parseRange(await props.searchParams);
  const res = await loadAs(async (tx) => ({
    cur: await statement(tx, r.from, r.to),
    prev: await statement(tx, r.prevFrom, r.prevTo),
    months: await tx<(IS & { month: Date })[]>`
      select m::date as month, s.* from generate_series(date_trunc('month', app.biz_date(now()) - interval '11 months'),
                                                        date_trunc('month', app.biz_date(now())::timestamp), interval '1 month') m,
             lateral public.income_statement(m::date, (m + interval '1 month - 1 day')::date) s order by m`,
    cats: await tx<{ category: string; units: number; revenue: number; cost: number; profit: number }[]>`
      select coalesce(c.name::text, 'Encargos') as category, sum(l.quantity)::int as units, sum(l.line_total_cents)::int8 as revenue,
             sum(l.cost_cents)::int8 as cost, sum(l.gross_profit_cents)::int8 as profit
      from public.sales_lines l left join public.categories c on c.id = l.category_id
      where l.business_date between ${r.from}::date and ${r.to}::date group by 1 order by profit desc`,
  }), { admin: true });
  if (!res) return <NeedsDatabase />;
  const cur = toStatement(res.data.cur), prev = toStatement(res.data.prev);
  const rows: { label: string; a: number; b: number; strong?: boolean; sign?: string }[] = [
    { label: "Ventas brutas", a: cur.grossSales, b: prev.grossSales },
    { label: "Descuentos", a: cur.discounts, b: prev.discounts, sign: "−" },
    { label: "Devoluciones", a: cur.returns, b: prev.returns, sign: "−" },
    { label: "Ingresos netos", a: cur.netRevenue, b: prev.netRevenue, strong: true, sign: "=" },
    { label: "Costo de la mercancía vendida", a: cur.costOfGoodsSold, b: prev.costOfGoodsSold, sign: "−" },
    { label: "Ganancia bruta", a: cur.grossProfit, b: prev.grossProfit, strong: true, sign: "=" },
    { label: "Gastos de funcionamiento", a: cur.operatingExpenses, b: prev.operatingExpenses, sign: "−" },
    { label: "Ganancia operativa", a: cur.operatingProfit, b: prev.operatingProfit, strong: true, sign: "=" },
    { label: "Cargos bancarios", a: cur.financialExpenses, b: prev.financialExpenses, sign: "−" },
    { label: "Ganancia neta", a: cur.netProfit, b: prev.netProfit, strong: true, sign: "=" },
  ];
  const chart = res.data.months.map((m) => { const s = toStatement(m); const d = new Date(m.month);
    return { label: MESES[d.getUTCMonth()], revenue: s.netRevenue, profit: s.netProfit }; });

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title="Ganancias" description={`Estado de resultados · ${r.label}, comparado con ${r.prevLabel}.`} />
      <RangeFilter basePath="/ganancias" preset={r.preset} from={r.from} to={r.to} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ingresos netos" value={formatMoney(cur.netRevenue)} />
        <Stat label="Ganancia bruta" value={formatMoney(cur.grossProfit)} />
        <Stat label="Ganancia neta" value={formatMoney(cur.netProfit)} tone={cur.netProfit >= 0 ? "success" : "danger"} />
        <Stat label="Margen neto" value={formatPct(cur.netMarginPct, false)} tone="pink" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="Estado de resultados">
          <TableWrap><table className="table-base">
            <thead><tr><th>Concepto</th><th className="text-right">{r.label}</th><th className="text-right">Anterior</th><th className="text-right">Cambio</th></tr></thead>
            <tbody>{rows.map((x) => {
              const ch = changePct(x.a, x.b);
              return (
                <tr key={x.label} className={x.strong ? "bg-cream font-semibold text-plum" : ""}>
                  <td><span className="inline-block w-4 text-muted">{x.sign}</span>{x.label}</td>
                  <td className="tabular text-right">{formatMoney(x.a)}</td>
                  <td className="tabular text-right text-muted">{formatMoney(x.b)}</td>
                  <td className={`tabular text-right text-xs ${ch == null ? "text-muted" : ch >= 0 ? "text-success" : "text-danger"}`}>{formatPct(ch)}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
          <p className="mt-4 text-xs text-muted">
            Compras de mercancía del período: <b className="text-ink">{formatMoney(cur.inventoryPurchases)}</b>. No se restan: pasan al inventario
            y se vuelven costo cuando se venden. Sin ITBIS porque el negocio no tiene RNC.
          </p>
        </Panel>
        <Panel title="Últimos 12 meses"><MonthlyChart data={chart} /></Panel>
      </div>
      <Panel title="Rentabilidad por categoría">
        <TableWrap><table className="table-base">
          <thead><tr><th>Categoría</th><th className="text-right">Unidades</th><th className="text-right">Ventas</th><th className="text-right">Costo</th><th className="text-right">Ganancia</th><th className="text-right">Margen</th></tr></thead>
          <tbody>{res.data.cats.map((c) => (
            <tr key={c.category}>
              <td className="font-medium">{c.category}</td>
              <td className="tabular text-right">{c.units}</td>
              <td className="tabular text-right">{formatMoney(c.revenue)}</td>
              <td className="tabular text-right text-muted">{formatMoney(c.cost)}</td>
              <td className="tabular text-right font-semibold text-success">{formatMoney(c.profit)}</td>
              <td className="tabular text-right">{formatPct(c.revenue ? (c.profit / c.revenue) * 100 : 0, false)}</td>
            </tr>))}</tbody>
        </table></TableWrap>
      </Panel>
    </div>
  );
}
