import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { formatDay } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";

export const metadata = { title: "Clientes" };

export default async function CustomersPage(props: PageProps<"/clientes">) {
  const q = String((await props.searchParams).q ?? "").trim();
  const res = await loadAs((tx) => tx<{ id: number; full_name: string; phone: string | null; province: string | null; municipality: string | null;
    purchases: number; spent: number; last_purchase: Date | null; open_orders: number }[]>`
    select c.id, c.full_name, c.phone, c.province, c.municipality,
           count(s.id) filter (where s.status = 'completed')::int as purchases,
           coalesce(sum(s.total_cents) filter (where s.status = 'completed'), 0)::int8 as spent,
           max(s.sale_date) filter (where s.status = 'completed') as last_purchase,
           (select count(*) from public.orders o where o.customer_id = c.id
              and o.status in ('new','pending_payment','confirmed','preparing','shipped'))::int as open_orders
    from public.customers c left join public.sales s on s.customer_id = c.id
    where ${q} = '' or c.full_name ilike '%' || ${q} || '%' or c.phone ilike '%' || ${q} || '%' or c.document_id ilike '%' || ${q} || '%'
    group by c.id order by spent desc, c.full_name limit 300`);
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Clientes" description="Historial de compras y clientes recurrentes."
                  actions={<ButtonLink href="/clientes/nuevo"><Plus className="h-4 w-4" /> Nuevo cliente</ButtonLink>} />
      <form className="mb-4 flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Buscar por nombre, teléfono o cédula…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </label>
        <button className="rounded-xl border border-line bg-white px-4 text-sm font-medium text-plum hover:bg-blush-soft">Buscar</button>
      </form>
      <Panel>
        {res.data.length === 0 ? <EmptyState title="No hay clientes" action={<ButtonLink href="/clientes/nuevo">Registrar cliente</ButtonLink>} /> : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Cliente</th><th>Teléfono</th><th>Ubicación</th><th className="text-right">Compras</th><th className="text-right">Total gastado</th><th>Última compra</th></tr></thead>
              <tbody>
                {res.data.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/clientes/${c.id}`} className="font-medium hover:text-pink-strong">{c.full_name}</Link>
                      {c.purchases >= 3 && <Badge tone="gold" className="ml-2">Recurrente</Badge>}
                      {c.open_orders > 0 && <Badge tone="info" className="ml-1">{c.open_orders} pedido(s)</Badge>}</td>
                    <td className="whitespace-nowrap text-muted">{c.phone ?? "—"}</td>
                    <td className="text-muted">{[c.municipality, c.province].filter(Boolean).join(", ") || "—"}</td>
                    <td className="tabular text-right">{c.purchases}</td>
                    <td className="tabular text-right font-semibold">{formatMoney(c.spent)}</td>
                    <td className="whitespace-nowrap text-muted">{c.last_purchase ? formatDay(c.last_purchase) : "—"}</td>
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
