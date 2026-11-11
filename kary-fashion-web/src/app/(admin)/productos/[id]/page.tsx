import { notFound } from "next/navigation";
import { ProductThumb } from "@/components/dashboard/product-thumb";
import { Badge } from "@/components/ui/badge";
import { NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { PRODUCT_STATUS } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { AddVariantForm, EditProductForm, VariantRowForm } from "./forms";

type Variant = { id: number; sku: string; size: string | null; color: string | null; price_cents: number; stock: number;
  min_stock: number; active: boolean; avg_cost_cents: number | null; sold: number };

export default async function ProductPage(props: PageProps<"/productos/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid)) notFound();
  const res = await loadAs(async (tx, user) => {
    const [product] = await tx<{ id: number; sku_base: string; name: string; category_id: number; category: string; brand: string | null;
      supplier_id: number | null; description: string | null; image_url: string | null; status: string; published: boolean }[]>`
      select p.id, p.sku_base::text, p.name, p.category_id, c.name::text as category, p.brand, p.supplier_id, p.description,
             p.image_url, p.status::text, p.published
      from public.products p join public.categories c on c.id = p.category_id where p.id = ${pid} and p.deleted_at is null`;
    if (!product) return null;
    const variants = await tx<Variant[]>`
      select pv.id, pv.sku::text, pv.size, pv.color, pv.price_cents, pv.stock, pv.min_stock, pv.active,
             ${user.isAdmin ? tx`vc.avg_cost_cents` : tx`null::int8`} as avg_cost_cents,
             coalesce((select sum(si.quantity) from public.staff_sale_items si join public.sales s on s.id = si.sale_id
                        where si.variant_id = pv.id and s.status = 'completed'), 0)::int as sold
      from public.product_variants pv left join public.variant_costs vc on vc.variant_id = pv.id
      where pv.product_id = ${pid} and pv.deleted_at is null order by pv.color nulls first, pv.size`;
    return {
      product, variants,
      categories: await tx<{ id: number; name: string }[]>`select id, name::text from public.categories order by sort_order, name`,
      suppliers: user.isAdmin ? await tx<{ id: number; name: string }[]>`select id, name from public.suppliers where active order by name` : [],
    };
  });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { product: p, variants } = res.data;
  const admin = res.user.isAdmin;
  const stock = variants.reduce((a, v) => a + Math.max(v.stock, 0), 0);

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader
        back={{ href: "/productos", label: "Productos" }}
        title={<span className="flex items-center gap-3"><ProductThumb category={p.category} photoUrl={p.image_url ?? undefined} />{p.name}</span>}
        description={<>{p.sku_base} · {p.category} · {stock} unidades en total</>}
        actions={<>
          <Badge tone={p.status === "active" ? "success" : "neutral"}>{PRODUCT_STATUS[p.status]}</Badge>
          {p.published && <Badge tone="lavender">Publicado en tienda</Badge>}
        </>}
      />
      {sp.creado && <p className="rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">Producto registrado correctamente.</p>}

      <Panel title="Tallas y colores" bodyClassName="p-5">
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Variante</th><th>Código</th><th className="text-right">Existencia</th><th className="text-right">Vendidas</th>
                {admin && <th className="text-right">Costo prom.</th>}
                {admin && <th className="text-right">Ganancia/unid.</th>}
                <th>{admin ? "Precio · mínimo · activa" : "Precio"}</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium">{[v.color, v.size && `Talla ${v.size}`].filter(Boolean).join(" · ") || "Única"}</td>
                  <td className="text-xs text-muted">{v.sku}</td>
                  <td className="tabular text-right">
                    <span className={v.stock <= v.min_stock ? "font-semibold text-danger" : "font-semibold"}>{v.stock}</span>
                    <span className="text-xs text-muted"> / mín {v.min_stock}</span>
                  </td>
                  <td className="tabular text-right">{v.sold}</td>
                  {admin && <td className="tabular text-right">{v.avg_cost_cents != null ? formatMoney(v.avg_cost_cents) : "—"}</td>}
                  {admin && (
                    <td className="tabular text-right">
                      {v.avg_cost_cents != null ? (
                        <span className="text-success">{formatMoney(v.price_cents - v.avg_cost_cents)}
                          <span className="text-xs text-muted"> ({Math.round(((v.price_cents - v.avg_cost_cents) / v.price_cents) * 100)}%)</span></span>
                      ) : "—"}
                    </td>
                  )}
                  <td>{admin ? <VariantRowForm v={v} /> : <span className="tabular">{formatMoney(v.price_cents)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {admin && <AddVariantForm productId={p.id} />}
      </Panel>

      {admin && (
        <Panel title="Datos del producto">
          <EditProductForm p={p} categories={res.data.categories} suppliers={res.data.suppliers} />
        </Panel>
      )}
    </div>
  );
}
