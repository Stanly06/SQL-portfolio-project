import Link from "next/link";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDay } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { SupplierForm } from "./supplier-form";

export const metadata = { title: "Proveedores" };

export default async function SuppliersPage() {
  const res = await loadAs((tx) => tx<{ id: number; name: string; contact: string | null; phone: string | null; active: boolean;
    purchases: number; total: number; last: Date | null }[]>`
    select s.id, s.name, s.contact, s.phone, s.active, count(po.id) filter (where po.status = 'received')::int as purchases,
           coalesce(sum(po.total_cents) filter (where po.status = 'received'), 0)::int8 as total, max(po.received_at) as last
    from public.suppliers s left join public.purchase_orders po on po.supplier_id = s.id
    group by s.id order by s.active desc, s.name`, { admin: true });
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Proveedores" description="Contactos e historial de compras de mercancía." />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel>
          {res.data.length === 0 ? <EmptyState title="Sin proveedores">Agregue el primero con el formulario.</EmptyState> : (
            <TableWrap><table className="table-base">
              <thead><tr><th>Proveedor</th><th>Contacto</th><th className="text-right">Compras</th><th className="text-right">Total comprado</th><th>Última</th></tr></thead>
              <tbody>{res.data.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                  <td><Link href={`/proveedores/${s.id}`} className="font-medium hover:text-pink-strong">{s.name}</Link></td>
                  <td className="text-muted">{[s.contact, s.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="tabular text-right">{s.purchases}</td>
                  <td className="tabular text-right font-semibold">{formatMoney(s.total)}</td>
                  <td className="text-muted">{s.last ? formatDay(s.last) : "—"}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          )}
        </Panel>
        <Panel title="Nuevo proveedor"><SupplierForm /></Panel>
      </div>
    </div>
  );
}
