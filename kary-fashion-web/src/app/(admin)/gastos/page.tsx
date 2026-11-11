import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { RangeFilter } from "@/components/ui/range-filter";
import { formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY, formatDay, PAYMENT_METHOD } from "@/lib/labels";
import { todayRD } from "@/lib/server/dashboard";
import { loadAs } from "@/lib/server/page";
import { parseRange } from "@/lib/server/range";
import { DeleteExpense, ExpenseForm } from "./forms";

export const metadata = { title: "Gastos" };

export default async function ExpensesPage(props: PageProps<"/gastos">) {
  const r = parseRange(await props.searchParams);
  const res = await loadAs(async (tx) => ({
    rows: await tx<{ id: number; expense_date: Date; category: string; concept: string; amount_cents: number; payment_method: string; notes: string | null; who: string | null }[]>`
      select e.id, e.expense_date, e.category::text, e.concept, e.amount_cents, e.payment_method::text, e.notes, p.full_name as who
      from public.expenses e left join public.profiles p on p.id = e.created_by
      where e.expense_date between ${r.from}::date and ${r.to}::date order by e.expense_date desc, e.id desc`,
    prev: (await tx<{ total: number }[]>`select coalesce(sum(amount_cents), 0)::int8 as total from public.expenses
      where expense_date between ${r.prevFrom}::date and ${r.prevTo}::date`)[0].total,
  }), { admin: true });
  if (!res) return <NeedsDatabase />;
  const { rows, prev } = res.data;
  const total = rows.reduce((a, x) => a + x.amount_cents, 0);
  const byCat = Object.entries(rows.reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] ?? 0) + x.amount_cents }), {}))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title="Gastos" description={`Gastos de funcionamiento · ${r.label}. Las compras de mercancía no van aquí: van en Compras.`} />
      <RangeFilter basePath="/gastos" preset={r.preset} from={r.from} to={r.to} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Total · ${r.label}`} value={formatMoney(total)} tone="pink" />
        <Stat label={`Comparado con ${r.prevLabel}`} value={formatMoney(prev)} />
        <Stat label="Cantidad de gastos" value={rows.length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {byCat.length > 0 && (
            <Panel title="Por categoría">
              <ul className="space-y-2.5">{byCat.map(([k, v]) => (
                <li key={k} className="text-sm">
                  <div className="flex justify-between"><span>{EXPENSE_CATEGORY[k]}</span><span className="tabular font-semibold">{formatMoney(v)}
                    <span className="ml-2 text-xs font-normal text-muted">{Math.round((v / total) * 100)}%</span></span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-gradient-to-r from-pink to-lavender" style={{ width: `${(v / byCat[0][1]) * 100}%` }} /></div>
                </li>))}</ul>
            </Panel>
          )}
          <Panel title="Detalle">
            {rows.length === 0 ? <EmptyState title="Sin gastos en este período" /> : (
              <TableWrap><table className="table-base">
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Pago</th><th className="text-right">Monto</th><th /></tr></thead>
                <tbody>{rows.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap text-muted">{formatDay(x.expense_date)}</td>
                    <td>{x.concept}{x.notes && <span className="block text-xs text-muted">{x.notes}</span>}</td>
                    <td>{EXPENSE_CATEGORY[x.category]}</td>
                    <td className="text-muted">{PAYMENT_METHOD[x.payment_method]}</td>
                    <td className="tabular text-right font-semibold">{formatMoney(x.amount_cents)}</td>
                    <td className="text-right"><DeleteExpense id={x.id} /></td>
                  </tr>))}</tbody>
              </table></TableWrap>
            )}
          </Panel>
        </div>
        <Panel title="Registrar gasto"><ExpenseForm today={todayRD()} /></Panel>
      </div>
    </div>
  );
}
