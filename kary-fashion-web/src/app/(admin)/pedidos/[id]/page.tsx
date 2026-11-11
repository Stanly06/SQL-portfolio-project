import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { OrderStatusBadge } from "@/components/dashboard/order-status";
import { Badge } from "@/components/ui/badge";
import { NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { CHANNEL, formatDateTime, formatDay, ORDER_STATUS_LABEL, PAYMENT_METHOD } from "@/lib/labels";
import { ORDER_STATUS_DB } from "@/lib/server/dashboard";
import { loadAs } from "@/lib/server/page";
import { OrderActions } from "./order-actions";

export default async function OrderPage(props: PageProps<"/pedidos/[id]">) {
  const id = Number((await props.params).id);
  const sp = await props.searchParams;
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [o] = await tx<{ id: number; number: string; status: string; channel: string; is_special_order: boolean; customer_id: number;
      customer: string; phone: string | null; subtotal_cents: number; discount_cents: number; shipping_cents: number; total_cents: number;
      paid_cents: number; balance_cents: number; expected_date: Date | null; shipping_address: string | null; province: string | null;
      municipality: string | null; notes: string | null; created_at: Date; sale_id: number | null; sale_number: number | null }[]>`
      select o.id, o.number, o.status::text, o.channel::text, o.is_special_order, o.customer_id, c.full_name as customer,
             coalesce(c.whatsapp, c.phone) as phone, o.subtotal_cents, o.discount_cents, o.shipping_cents, o.total_cents,
             b.paid_cents, b.balance_cents, o.expected_date, o.shipping_address, o.province, o.municipality, o.notes, o.created_at,
             s.id as sale_id, s.number as sale_number
      from public.orders o join public.customers c on c.id = o.customer_id join public.order_balances b on b.id = o.id
      left join public.sales s on s.order_id = o.id where o.id = ${id}`;
    if (!o) return null;
    return {
      o,
      items: await tx<{ id: number; description: string; quantity: number; unit_price_cents: number; variant_id: number | null; stock: number | null }[]>`
        select oi.id, oi.description, oi.quantity, oi.unit_price_cents, oi.variant_id, pv.stock
        from public.staff_order_items oi left join public.product_variants pv on pv.id = oi.variant_id where oi.order_id = ${id} order by oi.id`,
      payments: await tx<{ id: number; method: string; amount_cents: number; reference: string | null; status: string; received_at: Date }[]>`
        select id, method::text, amount_cents, reference, status::text, received_at from public.payments where order_id = ${id} order by id`,
      history: await tx<{ from_status: string | null; to_status: string; note: string | null; changed_at: Date; who: string | null }[]>`
        select h.from_status::text, h.to_status::text, h.note, h.changed_at, p.full_name as who
        from public.order_status_history h left join public.profiles p on p.id = h.changed_by where h.order_id = ${id} order by h.id`,
      transitions: await tx<{ to_status: string }[]>`
        select to_status::text from public.order_status_transitions t join public.orders o on o.status = t.from_status
        where o.id = ${id} and t.to_status <> 'delivered'`,
    };
  });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { o, items, payments, history, transitions } = res.data;
  const open = ["new", "pending_payment", "confirmed", "preparing", "shipped"].includes(o.status);
  const missingStock = items.filter((i) => i.variant_id && (i.stock ?? 0) < i.quantity);
  const digits = (o.phone ?? "").replace(/\D/g, "");
  const wa = digits.length === 10 ? `1${digits}` : digits;
  const waText = `Hola ${o.customer.split(" ")[0]}, le escribimos de Kary Fashion sobre su pedido ${o.number}. ` +
    (o.balance_cents > 0 ? `Balance pendiente: ${formatMoney(o.balance_cents)}.` : "¡Ya está pagado!");

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader back={{ href: "/pedidos", label: "Pedidos" }}
                  title={<span className="flex flex-wrap items-center gap-2">Pedido {o.number} <OrderStatusBadge status={ORDER_STATUS_DB[o.status]} />
                    {o.is_special_order && <Badge tone="gold">Encargo</Badge>}</span>}
                  description={<><Link href={`/clientes/${o.customer_id}`} className="hover:text-pink-strong">{o.customer}</Link> · {CHANNEL[o.channel]} · {formatDateTime(o.created_at)}</>}
                  actions={wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-success hover:bg-success-soft">
                    <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp</a>} />
      {sp.nuevo && <p className="rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">Pedido creado.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatMoney(o.total_cents)} />
        <Stat label="Pagado" value={formatMoney(o.paid_cents)} tone="success" />
        <Stat label="Pendiente" value={formatMoney(o.balance_cents)} tone={o.balance_cents > 0 ? "pink" : "default"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Panel title="Artículos">
            <TableWrap><table className="table-base">
              <thead><tr><th>Artículo</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Importe</th><th>Existencia</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td>
                  <td className="tabular text-right">{i.quantity}</td>
                  <td className="tabular text-right">{formatMoney(i.unit_price_cents)}</td>
                  <td className="tabular text-right font-medium">{formatMoney(i.quantity * i.unit_price_cents)}</td>
                  <td>{i.variant_id == null ? <Badge tone="gold">Por encargo</Badge>
                    : (i.stock ?? 0) >= i.quantity ? <Badge tone="success">Disponible ({i.stock})</Badge> : <Badge tone="danger">Falta ({i.stock ?? 0})</Badge>}</td>
                </tr>))}</tbody>
            </table></TableWrap>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              {o.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Descuento</dt><dd className="tabular">-{formatMoney(o.discount_cents)}</dd></div>}
              {o.shipping_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Envío</dt><dd className="tabular">{formatMoney(o.shipping_cents)}</dd></div>}
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(o.total_cents)}</dd></div>
            </dl>
          </Panel>
          <Panel title="Pagos y anticipos">
            {payments.length === 0 ? <p className="text-sm text-muted">Sin pagos registrados.</p> : (
              <ul className="divide-y divide-line text-sm">{payments.map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <span>{PAYMENT_METHOD[p.method]}{p.reference && <span className="text-muted"> · {p.reference}</span>}
                    <span className="block text-xs text-muted">{formatDateTime(p.received_at)}</span></span>
                  <span className="tabular font-medium">{formatMoney(p.amount_cents)} {p.status === "refunded" && <Badge tone="danger">Reembolsado</Badge>}</span>
                </li>))}</ul>
            )}
          </Panel>
          <Panel title="Historial">
            <ol className="space-y-2 text-sm">{history.map((h, k) => (
              <li key={k} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pink" />
                <span><b>{ORDER_STATUS_LABEL[h.to_status]}</b>{h.note && <> · {h.note}</>}
                  <span className="block text-xs text-muted">{formatDateTime(h.changed_at)}{h.who && ` · ${h.who}`}</span></span></li>))}</ol>
          </Panel>
        </div>
        <aside className="space-y-5">
          {(o.shipping_address || o.province || o.expected_date || o.notes) && (
            <Panel title="Entrega">
              <dl className="space-y-1 text-sm">
                {o.expected_date && <p><span className="text-muted">Fecha estimada:</span> {formatDay(o.expected_date)}</p>}
                {(o.shipping_address || o.province) && <p><span className="text-muted">Dirección:</span> {[o.shipping_address, o.municipality, o.province].filter(Boolean).join(", ")}</p>}
                {o.notes && <p><span className="text-muted">Notas:</span> {o.notes}</p>}
              </dl>
            </Panel>
          )}
          {o.sale_id && <Panel title="Factura"><Link href={`/ventas/${o.sale_id}`} className="font-medium text-pink-strong hover:underline">Ver venta #{o.sale_number} →</Link></Panel>}
          {open && (
            <OrderActions id={o.id} balance={o.balance_cents} paid={o.paid_cents} isAdmin={res.user.isAdmin}
                          transitions={transitions.map((t) => t.to_status)} canDeliver={["confirmed", "preparing", "shipped"].includes(o.status)}
                          missingStock={missingStock.map((m) => m.description)} />
          )}
        </aside>
      </div>
    </div>
  );
}
