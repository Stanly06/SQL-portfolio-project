import Link from "next/link";
import { FileSpreadsheet, Plus, Search } from "lucide-react";
import { ProductThumb } from "@/components/dashboard/product-thumb";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { PRODUCT_STATUS } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";

export const metadata = { title: "Productos" };

type Row = {
  id: number; sku_base: string; name: string; category: string; image_url: string | null; status: string; published: boolean;
  variants: number; stock: number; min_price: number; max_price: number; low: number;
};

export default async function ProductsPage(props: PageProps<"/productos">) {
  const sp = await props.searchParams;
  const q = String(sp.q ?? "").trim();
  const cat = Number(sp.categoria) || null;
  const res = await loadAs(async (tx) => ({
    categories: await tx<{ id: number; name: string }[]>`select id, name::text from public.categories order by sort_order, name`,
    rows: await tx<Row[]>`
      select p.id, p.sku_base::text, p.name, c.name::text as category, p.image_url, p.status, p.published,
             count(pv.id)::int as variants, coalesce(sum(greatest(pv.stock, 0)), 0)::int as stock,
             coalesce(min(pv.price_cents), 0)::int8 as min_price, coalesce(max(pv.price_cents), 0)::int8 as max_price,
             count(*) filter (where pv.stock <= pv.min_stock)::int as low
      from public.products p
      join public.categories c on c.id = p.category_id
      left join public.product_variants pv on pv.product_id = p.id and pv.deleted_at is null and pv.active
      where p.deleted_at is null
        and (${cat}::bigint is null or p.category_id = ${cat})
        and (${q} = '' or p.name ilike '%' || ${q} || '%' or p.sku_base ilike '%' || ${q} || '%'
             or exists (select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike '%' || ${q} || '%'))
      group by p.id, c.name order by p.name limit 300`,
  }));
  if (!res) return <NeedsDatabase />;
  const { rows, categories } = res.data;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Productos" description={`${rows.length} producto(s) en el catálogo`}
                  actions={res.user.isAdmin && <>
                    <ButtonLink href="/productos/importar" variant="outline"><FileSpreadsheet className="h-4 w-4" /> Importar desde Excel</ButtonLink>
                    <ButtonLink href="/productos/nuevo"><Plus className="h-4 w-4" /> Nuevo producto</ButtonLink>
                  </>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o código…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </label>
        <select name="categoria" defaultValue={cat ?? ""} className="input w-auto">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="rounded-xl border border-line bg-white px-4 text-sm font-medium text-plum hover:bg-blush-soft">Filtrar</button>
      </form>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="No hay productos" action={res.user.isAdmin && <ButtonLink href="/productos/nuevo">Registrar el primero</ButtonLink>}>
            {q || cat ? "Ningún producto coincide con la búsqueda." : "Registre sus productos con sus tallas y colores."}
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr><th>Producto</th><th>Categoría</th><th className="text-right">Precio</th><th className="text-right">Existencia</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/productos/${r.id}`} className="flex items-center gap-3">
                        <ProductThumb category={r.category} photoUrl={r.image_url ?? undefined} className="h-10 w-10" />
                        <span>
                          <span className="block font-medium text-ink hover:text-pink-strong">{r.name}</span>
                          <span className="text-xs text-muted">{r.sku_base} · {r.variants} variante(s)</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted">{r.category}</td>
                    <td className="tabular text-right whitespace-nowrap">
                      {r.min_price === r.max_price ? formatMoney(r.min_price) : `${formatMoney(r.min_price)} – ${formatMoney(r.max_price)}`}
                    </td>
                    <td className="tabular text-right">
                      <span className="font-semibold">{r.stock}</span>
                      {r.low > 0 && <Badge tone="warning" className="ml-2">{r.low} bajo</Badge>}
                    </td>
                    <td className="space-x-1 whitespace-nowrap">
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>{PRODUCT_STATUS[r.status]}</Badge>
                      {r.published && <Badge tone="lavender">En tienda</Badge>}
                    </td>
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
