import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDateTime, MOVEMENT } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";

export const metadata = { title: "Movimientos de inventario" };

export default async function MovementsPage() {
  const res = await loadAs((tx) => tx<{ id: number; created_at: Date; type: string; quantity: number; stock_after: number;
    unit_cost_cents: number | null; note: string | null; sku: string; name: string; size: string | null; color: string | null; user_name: string | null }[]>`
    select m.id, m.created_at, m.type::text, m.quantity, m.stock_after, m.unit_cost_cents, m.note, pv.sku::text, p.name,
           pv.size, pv.color, pr.full_name as user_name
    from public.inventory_movements m
    join public.product_variants pv on pv.id = m.variant_id join public.products p on p.id = pv.product_id
    left join public.profiles pr on pr.id = m.created_by
    order by m.id desc limit 300`, { admin: true });
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Movimientos de inventario" back={{ href: "/inventario", label: "Inventario" }}
                  description="Historial de cada entrada y salida (kardex). No se puede editar ni borrar." />
      <Panel>
        {res.data.length === 0 ? <EmptyState title="Todavía no hay movimientos" /> : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th className="text-right">Cantidad</th><th className="text-right">Queda</th><th className="text-right">Costo unid.</th><th>Detalle</th><th>Usuario</th></tr></thead>
              <tbody>
                {res.data.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(m.created_at)}</td>
                    <td><span className="font-medium">{m.name}</span>
                      <span className="block text-xs text-muted">{[m.color, m.size && `T/${m.size}`].filter(Boolean).join(" · ")} · {m.sku}</span></td>
                    <td><Badge tone={m.quantity > 0 ? "success" : "pink"}>{MOVEMENT[m.type] ?? m.type}</Badge></td>
                    <td className={`tabular text-right font-semibold ${m.quantity > 0 ? "text-success" : "text-danger"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="tabular text-right">{m.stock_after}</td>
                    <td className="tabular text-right">{m.unit_cost_cents != null ? formatMoney(m.unit_cost_cents) : "—"}</td>
                    <td className="text-xs text-muted">{m.note}</td>
                    <td className="text-xs">{m.user_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
