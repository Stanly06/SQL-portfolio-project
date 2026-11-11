import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { CHANNEL, formatDateTime, PAYMENT_METHOD } from "@/lib/labels";
import { todayRD } from "@/lib/server/dashboard";
import { loadAs } from "@/lib/server/page";

export const metadata = { title: "Ventas" };

export default async function SalesPage(props: PageProps<"/ventas">) {
  const sp = await props.searchParams;
  const today = todayRD();
  const monthStart = `${today.slice(0, 8)}01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.desde)) ? String(sp.desde) : monthStart;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.hasta)) ? String(sp.hasta) : today;
  const q = String(sp.q ?? "").trim();
  const res = await loadAs((tx) => tx<{ id: number; number: number; sale_date: Date; customer: string | null; channel: string; status: string;
    total_cents: number; discount_cents: number; seller: string | null; methods: string[] | null; invoice: string | null; ncf: string | null }[]>`
    select s.id, s.number, s.sale_date, c.full_name as customer, s.channel::text, s.status::text, s.total_cents, s.discount_cents,
           pr.full_name as seller, i.number as invoice, i.ncf,
           (select array_agg(distinct p.method::text) from public.payments p where p.sale_id = s.id) as methods
    from public.sales s left join public.customers c on c.id = s.customer_id left join public.profiles pr on pr.id = s.sold_by
    left join public.invoices i on i.sale_id = s.id
    where app.biz_date(s.sale_date) between ${from}::date and ${to}::date
      and (${q} = '' or s.number::text = ${q.replace(/^#/, "")} or c.full_name ilike '%' || ${q} || '%' or i.ncf = upper(${q}))
    order by s.sale_date desc limit 500`);
  if (!res) return <NeedsDatabase />;
  const ok = res.data.filter((s) => s.status === "completed");
  const total = ok.reduce((a, s) => a + s.total_cents, 0);
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader title="Ventas" description="Todas las ventas con su factura, método de pago y vendedora."
                  actions={<ButtonLink href="/ventas/nueva"><Plus className="h-4 w-4" /> Nueva venta</ButtonLink>} />
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Desde<input type="date" name="desde" defaultValue={from} className="input mt-1" /></label>
        <label className="text-xs text-muted">Hasta<input type="date" name="hasta" defaultValue={to} className="input mt-1" /></label>
        <label className="min-w-52 flex-1 text-xs text-muted">Buscar<input name="q" defaultValue={q} placeholder="No. de factura, cliente o NCF" className="input mt-1" /></label>
        <button className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-plum hover:bg-blush-soft">Filtrar</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ventas válidas" value={ok.length} />
        <Stat label="Total vendido" value={formatMoney(total)} tone="pink" />
        <Stat label="Ticket promedio" value={formatMoney(ok.length ? Math.round(total / ok.length) : 0)} />
      </div>
      <Panel>
        {res.data.length === 0 ? <EmptyState title="Sin ventas en este período" action={<ButtonLink href="/ventas/nueva">Registrar venta</ButtonLink>} /> : (
          <TableWrap><table className="table-base">
            <thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Canal</th><th>Pago</th><th>Vendedora</th><th className="text-right">Total</th></tr></thead>
            <tbody>{res.data.map((s) => (
              <tr key={s.id} className={s.status === "cancelled" ? "opacity-60" : ""}>
                <td><Link href={`/ventas/${s.id}`} className="font-medium hover:text-pink-strong">#{s.number}</Link>
                  {s.ncf && <span className="block text-[11px] text-muted">{s.ncf}</span>}
                  {s.status === "cancelled" && <Badge tone="danger" className="ml-1">Anulada</Badge>}</td>
                <td className="whitespace-nowrap text-muted">{formatDateTime(s.sale_date)}</td>
                <td>{s.customer ?? <span className="text-muted">Cliente general</span>}</td>
                <td>{CHANNEL[s.channel]}</td>
                <td className="text-xs">{(s.methods ?? []).map((m) => PAYMENT_METHOD[m]).join(" + ")}</td>
                <td className="text-xs text-muted">{s.seller}</td>
                <td className="tabular text-right font-semibold">{formatMoney(s.total_cents)}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
