import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDay, ORDER_STATUS_LABEL } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { updateCustomer } from "../actions";
import { CustomerForm, type CustomerValues } from "../customer-form";

export default async function CustomerPage(props: PageProps<"/clientes/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [c] = await tx<(CustomerValues & { id: number; full_name: string; created_at: Date })[]>`
      select id, full_name, phone, whatsapp, email::text, document_id, address, province, municipality, notes, created_at
      from public.customers where id = ${id}`;
    if (!c) return null;
    return {
      c,
      sales: await tx<{ id: number; number: number; sale_date: Date; total_cents: number; status: string; items: number }[]>`
        select s.id, s.number, s.sale_date, s.total_cents, s.status::text,
               (select coalesce(sum(quantity), 0) from public.staff_sale_items si where si.sale_id = s.id)::int as items
        from public.sales s where s.customer_id = ${id} order by s.sale_date desc limit 100`,
      orders: await tx<{ id: number; number: string; created_at: Date; total_cents: number; balance_cents: number; status: string }[]>`
        select id, number, created_at, total_cents, balance_cents, status::text from public.order_balances
        where customer_id = ${id} order by created_at desc`,
    };
  });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { c, sales, orders } = res.data;
  const done = sales.filter((s) => s.status === "completed");
  const spent = done.reduce((a, s) => a + s.total_cents, 0);
  const wa = (c.whatsapp ?? c.phone ?? "").replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title={c.full_name} back={{ href: "/clientes", label: "Clientes" }}
                  description={`Cliente desde ${formatDay(c.created_at)}`}
                  actions={<>
                    {wa && <a href={`https://wa.me/${wa.length === 10 ? "1" + wa : wa}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-success hover:bg-success-soft">
                      <MessageCircle className="h-4 w-4" /> WhatsApp</a>}
                    <ButtonLink href={`/pedidos/nuevo?cliente=${c.id}`} variant="outline"><Plus className="h-4 w-4" /> Pedido</ButtonLink>
                    <ButtonLink href={`/ventas/nueva?cliente=${c.id}`}><Plus className="h-4 w-4" /> Venta</ButtonLink>
                  </>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Compras" value={done.length} />
        <Stat label="Total gastado" value={formatMoney(spent)} tone="pink" />
        <Stat label="Ticket promedio" value={formatMoney(done.length ? Math.round(spent / done.length) : 0)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Historial de compras">
          {sales.length === 0 ? <EmptyState title="Sin compras todavía" /> : (
            <TableWrap><table className="table-base">
              <thead><tr><th>Factura</th><th>Fecha</th><th className="text-right">Artículos</th><th className="text-right">Total</th></tr></thead>
              <tbody>{sales.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/ventas/${s.id}`} className="font-medium hover:text-pink-strong">#{s.number}</Link>
                    {s.status === "cancelled" && <Badge tone="danger" className="ml-2">Anulada</Badge>}</td>
                  <td className="text-muted">{formatDay(s.sale_date)}</td>
                  <td className="tabular text-right">{s.items}</td>
                  <td className="tabular text-right font-semibold">{formatMoney(s.total_cents)}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          )}
        </Panel>
        <Panel title="Pedidos">
          {orders.length === 0 ? <EmptyState title="Sin pedidos" /> : (
            <TableWrap><table className="table-base">
              <thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th className="text-right">Total</th><th className="text-right">Pendiente</th></tr></thead>
              <tbody>{orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/pedidos/${o.id}`} className="font-medium hover:text-pink-strong">{o.number}</Link></td>
                  <td className="text-muted">{formatDay(o.created_at)}</td>
                  <td><Badge tone="info">{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                  <td className="tabular text-right">{formatMoney(o.total_cents)}</td>
                  <td className="tabular text-right">{o.balance_cents > 0 ? formatMoney(o.balance_cents) : "—"}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          )}
        </Panel>
      </div>
      <Panel title="Datos del cliente"><CustomerForm action={updateCustomer} c={c} submit="Guardar cambios" /></Panel>
    </div>
  );
}
