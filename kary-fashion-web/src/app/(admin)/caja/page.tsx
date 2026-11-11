import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDateTime, formatDay, PAYMENT_METHOD } from "@/lib/labels";
import { todayRD } from "@/lib/server/dashboard";
import { loadAs } from "@/lib/server/page";
import { CloseForm } from "./close-form";

export const metadata = { title: "Caja" };

type Row = { method: string; sales_cents: number; deposits_cents: number; refunds_cents: number; expenses_cents: number; net_cents: number };

export default async function CashPage(props: PageProps<"/caja">) {
  const sp = await props.searchParams;
  const today = todayRD();
  const res = await loadAs(async (tx, user) => {
    const asked = String(sp.dia ?? "");
    const date = user.isAdmin && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;
    return {
      date,
      rows: await tx<Row[]>`select * from public.cash_summary(${date}::date)`,
      closing: (await tx<{ opening_cash_cents: number; expected_cash_cents: number; counted_cash_cents: number; difference_cents: number;
        notes: string | null; closed_at: Date; who: string | null }[]>`
        select c.opening_cash_cents, c.expected_cash_cents, c.counted_cash_cents, c.difference_cents, c.notes, c.closed_at, p.full_name as who
        from public.cash_closings c left join public.profiles p on p.id = c.closed_by where c.business_date = ${date}::date`)[0] ?? null,
      sales: (await tx<{ n: number }[]>`select count(*)::int as n from public.sales where status = 'completed' and app.biz_date(sale_date) = ${date}::date`)[0].n,
      history: user.isAdmin ? await tx<{ business_date: Date; expected_cash_cents: number; counted_cash_cents: number; difference_cents: number; who: string | null }[]>`
        select c.business_date, c.expected_cash_cents, c.counted_cash_cents, c.difference_cents, p.full_name as who
        from public.cash_closings c left join public.profiles p on p.id = c.closed_by order by c.business_date desc limit 30` : [],
    };
  });
  if (!res) return <NeedsDatabase />;
  const { date, rows, closing, sales, history } = res.data;
  const total = rows.reduce((a, r) => a + r.net_cents, 0);
  const cash = rows.find((r) => r.method === "cash")!;
  const visible = rows.filter((r) => r.sales_cents || r.deposits_cents || r.refunds_cents || r.expenses_cents || r.method !== "gateway");

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader title="Caja" description={`Dinero del ${date === today ? "día de hoy" : formatDay(date)} por método de pago.`}
                  actions={res.user.isAdmin && (
                    <form className="flex items-end gap-2"><label className="text-xs text-muted">Día
                      <input type="date" name="dia" defaultValue={date} max={today} className="input mt-1 py-1.5" /></label>
                      <button className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-plum hover:bg-blush-soft">Ver</button></form>
                  )} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ventas del día" value={sales} />
        <Stat label="Entró en total (neto)" value={formatMoney(total)} tone="pink" />
        <Stat label="Efectivo neto del día" value={formatMoney(cash.net_cents)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <Panel title="Movimientos por método">
          <TableWrap><table className="table-base">
            <thead><tr><th>Método</th><th className="text-right">Ventas</th><th className="text-right">Anticipos de pedidos</th>
              <th className="text-right">Devoluciones</th><th className="text-right">Gastos pagados</th><th className="text-right">Neto</th></tr></thead>
            <tbody>{visible.map((r) => (
              <tr key={r.method}>
                <td className="font-medium">{PAYMENT_METHOD[r.method]}</td>
                <td className="tabular text-right">{formatMoney(r.sales_cents)}</td>
                <td className="tabular text-right">{formatMoney(r.deposits_cents)}</td>
                <td className="tabular text-right text-danger">{r.refunds_cents ? `-${formatMoney(r.refunds_cents)}` : "—"}</td>
                <td className="tabular text-right text-danger">{r.expenses_cents ? `-${formatMoney(r.expenses_cents)}` : "—"}</td>
                <td className="tabular text-right font-semibold">{formatMoney(r.net_cents)}</td>
              </tr>))}
              <tr><td className="font-semibold">Total</td><td colSpan={4} /><td className="tabular text-right font-bold text-pink-strong">{formatMoney(total)}</td></tr>
            </tbody>
          </table></TableWrap>
          <p className="mt-4 text-xs text-muted">Las transferencias y tarjetas van al banco; en la caja solo debe estar el efectivo.</p>
        </Panel>
        <Panel title="Cierre del día" actions={closing ? <Badge tone="success">Cerrada</Badge> : <Badge tone="warning">Abierta</Badge>}>
          {closing ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Fondo inicial</dt><dd className="tabular">{formatMoney(closing.opening_cash_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Debía haber</dt><dd className="tabular">{formatMoney(closing.expected_cash_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Se contó</dt><dd className="tabular">{formatMoney(closing.counted_cash_cents)}</dd></div>
              <div className={`flex justify-between border-t border-line pt-1.5 font-semibold ${closing.difference_cents === 0 ? "text-success" : "text-danger"}`}>
                <dt>{closing.difference_cents === 0 ? "Cuadró exacto" : closing.difference_cents < 0 ? "Faltante" : "Sobrante"}</dt>
                <dd className="tabular">{formatMoney(Math.abs(closing.difference_cents))}</dd></div>
              {closing.notes && <p className="pt-2 text-muted">Nota: {closing.notes}</p>}
              <p className="pt-2 text-xs text-muted">Cerrada por {closing.who} · {formatDateTime(closing.closed_at)}</p>
            </dl>
          ) : <CloseForm date={date} cashNet={cash.net_cents} />}
        </Panel>
      </div>
      {res.user.isAdmin && (
        <Panel title="Cierres anteriores">
          {history.length === 0 ? <EmptyState title="Todavía no hay cierres" /> : (
            <TableWrap><table className="table-base">
              <thead><tr><th>Día</th><th className="text-right">Debía haber</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th><th>Cerró</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={String(h.business_date)}>
                  <td>{formatDay(h.business_date)}</td>
                  <td className="tabular text-right">{formatMoney(h.expected_cash_cents)}</td>
                  <td className="tabular text-right">{formatMoney(h.counted_cash_cents)}</td>
                  <td className={`tabular text-right font-semibold ${h.difference_cents === 0 ? "text-success" : "text-danger"}`}>
                    {h.difference_cents === 0 ? "Cuadra" : (h.difference_cents > 0 ? "+" : "-") + formatMoney(Math.abs(h.difference_cents))}</td>
                  <td className="text-muted">{h.who}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          )}
        </Panel>
      )}
    </div>
  );
}
