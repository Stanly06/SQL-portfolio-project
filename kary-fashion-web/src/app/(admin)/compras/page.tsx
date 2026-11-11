import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDay, PURCHASE_STATUS } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";

export const metadata = { title: "Compras" };

export default async function PurchasesPage() {
  const res = await loadAs((tx) => tx<{ id: number; number: string; order_date: Date; supplier: string | null; status: string;
    subtotal_cents: number; extra: number; total_cents: number; units: number }[]>`
    select po.id, po.number, po.order_date, s.name as supplier, po.status::text, po.subtotal_cents,
           (po.shipping_cents + po.other_costs_cents)::int8 as extra, po.total_cents,
           (select coalesce(sum(quantity), 0) from public.purchase_order_items i where i.purchase_order_id = po.id)::int as units
    from public.purchase_orders po left join public.suppliers s on s.id = po.supplier_id
    order by po.order_date desc, po.id desc limit 200`, { admin: true });
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Compras de mercancía" description="Lo que se invierte en inventario (no es gasto: se vuelve costo cuando se vende)."
                  actions={<ButtonLink href="/compras/nueva"><Plus className="h-4 w-4" /> Nueva compra</ButtonLink>} />
      <Panel>
        {res.data.length === 0 ? <EmptyState title="Sin compras registradas" action={<ButtonLink href="/compras/nueva">Registrar compra</ButtonLink>} /> : (
          <TableWrap><table className="table-base">
            <thead><tr><th>Compra</th><th>Fecha</th><th>Proveedor</th><th>Estado</th><th className="text-right">Unidades</th>
              <th className="text-right">Mercancía</th><th className="text-right">Transporte/otros</th><th className="text-right">Total</th></tr></thead>
            <tbody>{res.data.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/compras/${p.id}`} className="font-medium hover:text-pink-strong">{p.number}</Link></td>
                <td className="text-muted">{formatDay(p.order_date)}</td>
                <td>{p.supplier ?? "—"}</td>
                <td><Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge></td>
                <td className="tabular text-right">{p.units}</td>
                <td className="tabular text-right">{formatMoney(p.subtotal_cents)}</td>
                <td className="tabular text-right">{formatMoney(p.extra)}</td>
                <td className="tabular text-right font-semibold">{formatMoney(p.total_cents)}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
