import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDay, PURCHASE_STATUS } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { SupplierForm, type SupplierValues } from "../supplier-form";

export default async function SupplierPage(props: PageProps<"/proveedores/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [s] = await tx<(SupplierValues & { id: number; name: string })[]>`
      select id, name, contact, phone, whatsapp, email::text, rnc, address, notes from public.suppliers where id = ${id}`;
    if (!s) return null;
    const pos = await tx<{ id: number; number: string; order_date: Date; status: string; total_cents: number; units: number }[]>`
      select po.id, po.number, po.order_date, po.status::text, po.total_cents,
             (select coalesce(sum(quantity), 0) from public.purchase_order_items i where i.purchase_order_id = po.id)::int as units
      from public.purchase_orders po where po.supplier_id = ${id} order by po.order_date desc, po.id desc`;
    return { s, pos };
  }, { admin: true });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { s, pos } = res.data;
  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title={s.name} back={{ href: "/proveedores", label: "Proveedores" }} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel title="Compras a este proveedor">
          {pos.length === 0 ? <EmptyState title="Sin compras registradas" /> : (
            <TableWrap><table className="table-base">
              <thead><tr><th>Compra</th><th>Fecha</th><th>Estado</th><th className="text-right">Unidades</th><th className="text-right">Total</th></tr></thead>
              <tbody>{pos.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/compras/${p.id}`} className="font-medium hover:text-pink-strong">{p.number}</Link></td>
                  <td className="text-muted">{formatDay(p.order_date)}</td>
                  <td><Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge></td>
                  <td className="tabular text-right">{p.units}</td>
                  <td className="tabular text-right font-semibold">{formatMoney(p.total_cents)}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          )}
        </Panel>
        <Panel title="Datos"><SupplierForm s={s} /></Panel>
      </div>
    </div>
  );
}
