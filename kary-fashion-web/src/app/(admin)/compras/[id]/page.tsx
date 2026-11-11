import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDateTime, formatDay, PURCHASE_STATUS } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { PurchaseActions } from "./purchase-actions";

export default async function PurchasePage(props: PageProps<"/compras/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [po] = await tx<{ id: number; number: string; order_date: Date; received_at: Date | null; status: string; supplier: string | null;
      supplier_invoice: string | null; subtotal_cents: number; shipping_cents: number; other_costs_cents: number; total_cents: number; notes: string | null }[]>`
      select po.id, po.number, po.order_date, po.received_at, po.status::text, s.name as supplier, po.supplier_invoice,
             po.subtotal_cents, po.shipping_cents, po.other_costs_cents, po.total_cents, po.notes
      from public.purchase_orders po left join public.suppliers s on s.id = po.supplier_id where po.id = ${id}`;
    if (!po) return null;
    const items = await tx<{ id: number; name: string; size: string | null; color: string | null; sku: string; quantity: number;
      unit_cost_cents: number; landed_unit_cost_cents: number | null; price_cents: number }[]>`
      select i.id, p.name, pv.size, pv.color, pv.sku::text, i.quantity, i.unit_cost_cents, i.landed_unit_cost_cents, pv.price_cents
      from public.purchase_order_items i join public.product_variants pv on pv.id = i.variant_id join public.products p on p.id = pv.product_id
      where i.purchase_order_id = ${id} order by i.id`;
    return { po, items };
  }, { admin: true });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { po, items } = res.data;
  const st = PURCHASE_STATUS[po.status];
  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader title={`Compra ${po.number}`} back={{ href: "/compras", label: "Compras" }}
                  description={<>{po.supplier ?? "Sin proveedor"} · {formatDay(po.order_date)}{po.supplier_invoice && <> · Factura {po.supplier_invoice}</>}</>}
                  actions={<Badge tone={st.tone}>{st.label}</Badge>} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Mercancía" value={formatMoney(po.subtotal_cents)} />
        <Stat label="Transporte" value={formatMoney(po.shipping_cents)} />
        <Stat label="Otros costos" value={formatMoney(po.other_costs_cents)} />
        <Stat label="Total invertido" value={formatMoney(po.total_cents)} tone="pink" />
      </div>
      <Panel title="Artículos" actions={po.received_at && <span className="text-xs text-muted">Recibida el {formatDateTime(po.received_at)}</span>}>
        <TableWrap><table className="table-base">
          <thead><tr><th>Artículo</th><th className="text-right">Cant.</th><th className="text-right">Costo proveedor</th>
            <th className="text-right">Costo real (con transporte)</th><th className="text-right">Precio venta</th><th className="text-right">Ganancia/unid.</th></tr></thead>
          <tbody>{items.map((i) => {
            const cost = i.landed_unit_cost_cents ?? i.unit_cost_cents;
            return (
              <tr key={i.id}>
                <td><span className="font-medium">{i.name}</span>
                  <span className="block text-xs text-muted">{[i.color, i.size && `T/${i.size}`].filter(Boolean).join(" · ")} · {i.sku}</span></td>
                <td className="tabular text-right">{i.quantity}</td>
                <td className="tabular text-right">{formatMoney(i.unit_cost_cents)}</td>
                <td className="tabular text-right">{i.landed_unit_cost_cents != null ? formatMoney(i.landed_unit_cost_cents) : <span className="text-muted">al recibir</span>}</td>
                <td className="tabular text-right">{formatMoney(i.price_cents)}</td>
                <td className="tabular text-right text-success">{formatMoney(i.price_cents - cost)}</td>
              </tr>);
          })}</tbody>
        </table></TableWrap>
      </Panel>
      {(po.status === "ordered" || po.status === "draft") && <PurchaseActions id={po.id} />}
    </div>
  );
}
