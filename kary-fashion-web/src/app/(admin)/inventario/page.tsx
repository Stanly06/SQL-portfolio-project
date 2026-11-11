import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney, formatNumber } from "@/lib/format";
import { loadAs } from "@/lib/server/page";
import { cn } from "@/lib/utils";
import { AdjustForm } from "./adjust-form";

export const metadata = { title: "Inventario" };

const FILTERS = [
  { value: "", label: "Todas" }, { value: "bajo", label: "Stock bajo" }, { value: "agotado", label: "Agotadas" },
];

export default async function InventoryPage(props: PageProps<"/inventario">) {
  const sp = await props.searchParams;
  const q = String(sp.q ?? "").trim();
  const f = String(sp.filtro ?? "");
  const res = await loadAs(async (tx, user) => ({
    rows: await tx<{ id: number; product_id: number; sku: string; name: string; size: string | null; color: string | null;
      category: string; stock: number; min_stock: number; price_cents: number }[]>`
      select pv.id, p.id as product_id, pv.sku::text, p.name, pv.size, pv.color, c.name::text as category,
             pv.stock, pv.min_stock, pv.price_cents
      from public.product_variants pv join public.products p on p.id = pv.product_id
      join public.categories c on c.id = p.category_id
      where pv.deleted_at is null and pv.active and p.deleted_at is null
        and (${f} <> 'bajo' or pv.stock <= pv.min_stock) and (${f} <> 'agotado' or pv.stock <= 0)
        and (${q} = '' or p.name ilike '%' || ${q} || '%' or pv.sku ilike '%' || ${q} || '%' or pv.color ilike '%' || ${q} || '%')
      order by (pv.stock <= pv.min_stock) desc, p.name, pv.color, pv.size limit 500`,
    valuation: user.isAdmin
      ? await tx<{ category: string; units: number; cost_value_cents: number; retail_value_cents: number }[]>`
          select category, units, cost_value_cents, retail_value_cents from public.inventory_valuation()`
      : [],
  }));
  if (!res) return <NeedsDatabase />;
  const { rows, valuation } = res.data;
  const admin = res.user.isAdmin;
  const cost = valuation.reduce((a, v) => a + v.cost_value_cents, 0);
  const retail = valuation.reduce((a, v) => a + v.retail_value_cents, 0);
  const units = valuation.reduce((a, v) => a + v.units, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader title="Inventario" description="Existencia por talla y color. La existencia solo cambia con compras, ventas, devoluciones y ajustes."
                  actions={admin && <Link href="/inventario/movimientos" className="text-sm font-medium text-pink-strong hover:underline">Ver movimientos →</Link>} />
      {admin && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Unidades en tienda" value={formatNumber(units)} />
          <Stat label="Dinero invertido (al costo)" value={formatMoney(cost)} tone="pink" />
          <Stat label="Valor a precio de venta" value={formatMoney(retail)} />
          <Stat label="Ganancia potencial" value={formatMoney(retail - cost)} tone="success" />
        </div>
      )}
      <form className="flex flex-wrap gap-2">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Buscar producto, código o color…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </label>
        <input type="hidden" name="filtro" value={f} />
        <button className="rounded-xl border border-line bg-white px-4 text-sm font-medium text-plum hover:bg-blush-soft">Buscar</button>
        <div className="flex rounded-xl bg-white p-1 text-sm shadow-sm">
          {FILTERS.map((x) => (
            <Link key={x.value} href={`/inventario?filtro=${x.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={cn("rounded-lg px-3 py-1.5", f === x.value ? "bg-blush text-pink-strong font-semibold" : "text-muted hover:text-plum")}>
              {x.label}
            </Link>
          ))}
        </div>
      </form>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Sin resultados">No hay variantes que coincidan con el filtro.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Producto</th><th>Variante</th><th>Código</th><th className="text-right">Precio</th><th className="text-right">Existencia</th><th>Estado</th>{admin && <th>Ajuste</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/productos/${r.product_id}`} className="font-medium hover:text-pink-strong">{r.name}</Link>
                      <span className="block text-xs text-muted">{r.category}</span></td>
                    <td>{[r.color, r.size && `T/${r.size}`].filter(Boolean).join(" · ") || "Única"}</td>
                    <td className="text-xs text-muted">{r.sku}</td>
                    <td className="tabular text-right">{formatMoney(r.price_cents)}</td>
                    <td className="tabular text-right font-semibold">{r.stock} <span className="text-xs font-normal text-muted">/ mín {r.min_stock}</span></td>
                    <td>{r.stock <= 0 ? <Badge tone="danger">Agotado</Badge> : r.stock <= r.min_stock ? <Badge tone="warning">Stock bajo</Badge> : <Badge tone="success">Disponible</Badge>}</td>
                    {admin && <td><AdjustForm variantId={r.id} stock={r.stock} /></td>}
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
