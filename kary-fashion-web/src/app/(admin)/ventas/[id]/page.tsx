import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { NeedsDatabase, PageHeader } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { CHANNEL, formatDateTime, PAYMENT_METHOD } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { InvoiceToolbar, SaleAdminActions } from "./sale-actions";

const KIND_TITLE: Record<string, string> = {
  commercial: "Factura", B02: "Factura de Consumo", B01: "Factura de Crédito Fiscal",
  E32: "Factura de Consumo Electrónica", E31: "Factura de Crédito Fiscal Electrónica",
};

export default async function SalePage(props: PageProps<"/ventas/[id]">) {
  const id = Number((await props.params).id);
  const sp = await props.searchParams;
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [s] = await tx<{ id: number; number: number; sale_date: Date; status: string; channel: string; subtotal_cents: number;
      discount_cents: number; shipping_cents: number; total_cents: number; tax_cents: number; cash_received_cents: number;
      change_cents: number; notes: string | null; cancel_reason: string | null; customer: string | null; customer_phone: string | null;
      customer_doc: string | null; seller: string | null; invoice: string; kind: string; ncf: string | null; ncf_status: string; order_number: string | null }[]>`
      select s.id, s.number, s.sale_date, s.status::text, s.channel::text, s.subtotal_cents, s.discount_cents, s.shipping_cents,
             s.total_cents, s.tax_cents, s.cash_received_cents, s.change_cents, s.notes, s.cancel_reason,
             c.full_name as customer, coalesce(c.whatsapp, c.phone) as customer_phone, c.document_id as customer_doc,
             pr.full_name as seller, i.number as invoice, i.kind::text, i.ncf, i.ncf_status::text, o.number as order_number
      from public.sales s left join public.customers c on c.id = s.customer_id left join public.profiles pr on pr.id = s.sold_by
      join public.invoices i on i.sale_id = s.id left join public.orders o on o.id = s.order_id where s.id = ${id}`;
    if (!s) return null;
    return {
      s,
      items: await tx<{ id: number; description: string; sku: string | null; quantity: number; unit_price_cents: number;
        discount_cents: number; line_total_cents: number; returned: number }[]>`
        select si.id, si.description, si.sku, si.quantity, si.unit_price_cents, si.discount_cents, si.line_total_cents,
               coalesce((select sum(quantity) from public.return_items ri where ri.sale_item_id = si.id), 0)::int as returned
        from public.staff_sale_items si where si.sale_id = ${id} order by si.id`,
      payments: await tx<{ method: string; amount_cents: number; reference: string | null; status: string }[]>`
        select method::text, amount_cents, reference, status::text from public.payments
        where sale_id = ${id} or (order_id = (select order_id from public.sales where id = ${id})) order by id`,
      returns: await tx<{ id: number; created_at: Date; reason: string; refund_cents: number; refund_method: string | null }[]>`
        select id, created_at, reason, refund_cents, refund_method::text from public.returns where sale_id = ${id} order by id`,
      business: (await tx<{ value: Record<string, string | null> }[]>`select value from public.settings where key = 'business'`)[0]?.value ?? {},
    };
  });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { s, items, payments, returns, business: b } = res.data;
  const cancelled = s.status === "cancelled";
  const waText = `Hola${s.customer ? ` ${s.customer.split(" ")[0]}` : ""}, gracias por su compra en ${b.name ?? "Kary Fashion"}.\n` +
    `Factura #${s.number} · ${formatDateTime(s.sale_date)}\n` +
    items.map((i) => `${i.quantity} x ${i.description} — ${formatMoney(i.line_total_cents)}`).join("\n") +
    `\nTotal: ${formatMoney(s.total_cents)}\n${b.instagram ? `Síguenos en Instagram ${b.instagram}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="print:hidden">
        <PageHeader title={`Venta #${s.number}`} back={{ href: "/ventas", label: "Ventas" }}
                    actions={<InvoiceToolbar waText={waText} phone={s.customer_phone} />} />
        {sp.nueva && <p className="mb-4 rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
          ¡Venta registrada!{s.change_cents > 0 && <> Entregue <b>{formatMoney(s.change_cents)}</b> de cambio.</>}</p>}
      </div>

      {/* Factura imprimible */}
      <article className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8 print:border-0 print:shadow-none">
        {cancelled && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-12 rounded-xl border-4 border-danger/40 px-6 py-2 text-5xl font-black text-danger/30">ANULADA</span></div>}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-line pb-5">
          <div className="flex items-center gap-3">
            <Image src="/brand/kary-logo-sm.png" alt="" width={64} height={64} className="h-16 w-16" />
            <div>
              <p className="font-[family-name:var(--font-script)] text-3xl leading-none text-plum">{b.name ?? "Kary Fashion"}</p>
              <p className="mt-1 max-w-xs text-xs text-muted">{b.address}</p>
              <p className="text-xs text-muted">Tel. {b.phone} · IG {b.instagram} · TikTok {b.tiktok}</p>
              {b.rnc && <p className="text-xs text-muted">RNC {b.rnc}</p>}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-[family-name:var(--font-display)] font-semibold text-plum">{KIND_TITLE[s.kind] ?? "Factura"}</p>
            <p className="tabular">{s.invoice} · Venta #{s.number}</p>
            {s.ncf && <p className="tabular font-semibold">NCF {s.ncf}</p>}
            {s.ncf_status === "pending_authorization" && <Badge tone="warning">e-CF pendiente de DGII</Badge>}
            <p className="text-muted">{formatDateTime(s.sale_date)}</p>
          </div>
        </header>
        <div className="grid gap-1 py-4 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Cliente:</span> {s.customer ?? "Cliente general"}{s.customer_doc && <> · {s.customer_doc}</>}</p>
          <p className="sm:text-right"><span className="text-muted">Atendió:</span> {s.seller} · {CHANNEL[s.channel]}{s.order_number && <> · Pedido {s.order_number}</>}</p>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-plum"><th className="py-2">Cant.</th><th>Descripción</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th className="text-right">Importe</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="border-b border-line/50">
              <td className="tabular py-2">{i.quantity}</td>
              <td>{i.description}{i.returned > 0 && <Badge tone="warning" className="ml-2">{i.returned} devuelta(s)</Badge>}</td>
              <td className="tabular text-right">{formatMoney(i.unit_price_cents)}</td>
              <td className="tabular text-right text-muted">{i.discount_cents ? `-${formatMoney(i.discount_cents)}` : ""}</td>
              <td className="tabular text-right font-medium">{formatMoney(i.line_total_cents)}</td>
            </tr>))}</tbody>
        </table>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <p className="mb-1 font-semibold text-plum">Forma de pago</p>
            {payments.map((p, k) => (
              <p key={k} className="flex justify-between gap-3"><span>{p.method === "cash" && s.order_number ? "Efectivo/anticipo" : PAYMENT_METHOD[p.method]}{p.reference && <span className="text-muted"> · {p.reference}</span>}
                {p.status === "refunded" && <Badge tone="danger" className="ml-1">Reembolsado</Badge>}</span>
                <span className="tabular">{formatMoney(p.amount_cents)}</span></p>
            ))}
            {s.cash_received_cents > 0 && <p className="mt-1 text-xs text-muted">Efectivo recibido {formatMoney(s.cash_received_cents)} · Cambio {formatMoney(s.change_cents)}</p>}
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(s.subtotal_cents)}</dd></div>
            {s.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Descuentos</dt><dd className="tabular">-{formatMoney(s.discount_cents)}</dd></div>}
            {s.shipping_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Envío</dt><dd className="tabular">{formatMoney(s.shipping_cents)}</dd></div>}
            {s.tax_cents > 0 && <div className="flex justify-between"><dt className="text-muted">ITBIS incluido</dt><dd className="tabular">{formatMoney(s.tax_cents)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold text-pink-strong"><dt>Total</dt><dd className="tabular">{formatMoney(s.total_cents)}</dd></div>
          </dl>
        </div>
        {s.notes && <p className="mt-4 text-xs text-muted">Nota: {s.notes}</p>}
        <p className="mt-6 text-center text-xs text-muted">¡Gracias por su compra! Síguenos en {b.instagram}</p>
      </article>

      {cancelled && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger print:hidden">Venta anulada: {s.cancel_reason}</p>}
      {returns.length > 0 && (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-[#8a5410] print:hidden">
          {returns.map((r) => <p key={r.id}>Devolución {formatDateTime(r.created_at)}: {r.reason}{r.refund_cents > 0 && <> · reembolso {formatMoney(r.refund_cents)} ({PAYMENT_METHOD[r.refund_method ?? ""]})</>}</p>)}
        </div>
      )}
      {res.user.isAdmin && !cancelled && (
        <SaleAdminActions id={s.id} canCancel={returns.length === 0}
                          items={items.map((i) => ({ id: i.id, description: i.description, available: i.quantity - i.returned }))} />
      )}
    </div>
  );
}
